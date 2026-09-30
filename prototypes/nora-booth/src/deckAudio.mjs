// deckAudio.mjs — Nora's booth: a two-deck Web Audio engine.
//
// WHAT YOU HEAR IS WHAT NORA DOES. Every track is SYNTHESIZED in the browser (no files,
// nothing licensed, nothing fetched) as deep/tech house at one shared master tempo, and the
// graph is a real DJ signal path:
//
//   per deck:  voices → trim → stop-gate → EQ (low shelf 200 Hz · peak 1 kHz · high shelf
//              5 kHz) ─┬→ deck analyser (post-EQ, pre-fader: the deck screens' waveform)
//                      └→ channel fader (equal-power curve) → crossfader (constant power)
//   master:    Σ decks → master gain → safety clipper → master analyser (fftSize 512, the
//              app's own radio analyser size) → destination
//
// So the fader, EQ and crossfader values the choreography (noraMix) puts on the mixer model
// are the SAME values that move these AudioParams — the picture and the sound cannot disagree.
//
// ⚠ DETERMINISTIC. A track is a pure function of its spec { seed, name, artist, key, bars }:
// the kick tuning, swing, hat groove, bassline, chords, percussion and arrangement all come
// from a seeded PRNG. There is no Math.random and no wall clock in this file; timing comes
// from the AudioContext's own clock. `trackWaveform()` reads the SAME event list the
// scheduler plays, so the deck screens draw the actual content, not a decoration.
//
// ⚠ ANY BaseAudioContext. With an OfflineAudioContext nothing runs on a timer: the caller
// calls `engine.pump(untilSeconds)` to schedule, then `startRendering()`. That is how the
// test page measures tempo, band levels and headroom on real rendered audio.
//
// ⚠ NEVER SCHEDULES IN THE PAST. The realtime scheduler is a lookahead loop (≈25 ms tick,
// 0.12 s horizon). A tick that arrives late (a throttled background tab) widens the horizon
// up to 1.5 s for the ticks after it, and a step whose time has already gone is DROPPED,
// never started late — a late kick would flam against the other deck. `stats.late` counts
// any source whose start time was behind the clock when it was created, and must stay 0.
//
// BUFFER DECKS (Shape Radio's own audio). `engine.loadBuffer(deck, audioBuffer, meta, info)`
// puts a decoded AudioBuffer on a deck instead of a synthesized spec. `meta` is the shared
// track-analysis contract ({ bpm, downbeatSec, lengthBars, … } — see trackAnalysis.mjs); this
// file needs only bpm + downbeatSec (+ lengthBars, derived when absent) and never imports the
// analyser. A buffer deck feeds ONE AudioBufferSourceNode (a new one per play) through
//   bufIn (the trim) → the SAME stop-gate → EQ → analyser + fader → crossfader → master
// with playbackRate = engine.bpm / meta.bpm (beat-matched, no key lock — house is played
// that way), started on the audio clock so buffer time `downbeatSec + fromBar·4·beatSec`
// sounds exactly at barTime(atBar). A start that is already behind the clock joins LATE:
// it starts BUF_LEAD from now with its offset advanced by the elapsed time × rate, so it is
// still on the grid. `planBufferStart()` is that arithmetic as a pure function.
// ⚠ The buffer trim is well below 1: a produced house master sits around −9…−7 LUFS, far
// hotter than these synthesized decks, and the master safety clipper must stay transparent.
// BUFFER_TRIM is the measured default (see dist/buffer-deck-test); `info.trim` / `trimDb` /
// `lufs` (or the same keys on meta) override it per track.

const STEPS_PER_BAR = 16;
const TICK_MS = 25;
const LOOKAHEAD_MIN = 0.12;
const LOOKAHEAD_MAX = 1.5;
const MIN_LEAD = 0.004;       // a step closer than this to "now" is dropped, not played late
const CTRL_TAU = 0.025;       // smoothing for fader / EQ / crossfader moves
const EQ_KILL_DB = -26;       // the DJ-mixer kill floor (a DJM-style EQ range is −26..+6 dB)
const EQ_BOOST_DB = 6;
const DECK_TRIM = 0.36;       // gain staging: one deck, fader up, EQ flat peaks ≈ 0.55–0.65
// Buffer decks.
// A buffer start closer than this to "now" joins late (offset advanced) — a start the audio
// thread has already rendered past would be played LATE by the node, off the grid. Realtime
// contexts use max(BUF_LEAD, 2 × ctx.baseLatency), since a phone renders in bigger blocks.
const BUF_LEAD = 0.03;
const BUF_FADE_IN = 0.004;    // a late join lands mid-waveform: the gate ramps up over 4 ms
const BUF_FADE_OUT = 0.005;   // a stop / the buffer end: the gate ramps down over the 5 ms BEFORE it
// The loudness a buffer deck is trimmed to (integrated, BS.1770-4, gated) = the synthesized
// decks' own loudness through the same chain, MEASURED (dist/buffer-deck-test S4): the six
// demo tracks at full arrangement, fader up, EQ flat read −16.47 … −17.21, mean −16.73 LUFS.
export const BUFFER_TARGET_LUFS = -16.7;
// What the default trim assumes a buffer track is when nothing says otherwise: a produced
// house master (−9…−7 LUFS). The owned Shape Radio tracks on record measure −7.5 … −12.9 dBFS
// full-band RMS mid-track at unity (marketing/shape-radio-launch-cut.md), and a −8 LUFS
// house fixture reads −8.2 dBFS RMS — consistent. A per-track `lufs` makes it exact.
export const ASSUMED_MASTER_LUFS = -8;
export const BUFFER_TRIM = Math.pow(10, (BUFFER_TARGET_LUFS - ASSUMED_MASTER_LUFS) / 20);   // ≈ 0.367 (−8.7 dB)

// ---------------------------------------------------------------------------------------
// Demo tracks. Fictional titles and artists (invented for this prototype — not real
// releases or real people). Keys are Camelot; every track runs at the master tempo.
// ---------------------------------------------------------------------------------------
export const DEMO_TRACKS = [
  // Ordered clockwise round the Camelot wheel (8A → 9A → … → 1A), so each track mixes
  // harmonically into the next. Seeds chosen for variety: pad vs stab, five different
  // progressions, five bass rhythms, three hat grooves, clap vs snare, with/without perc.
  { seed: 3114, name: 'Tidewire', artist: 'Mirel Vantz', key: '8A', bars: 128 },
  { seed: 101, name: 'Sodium Hours', artist: 'Oskel Brann', key: '9A', bars: 128 },
  { seed: 5201, name: 'Basement Cartography', artist: 'Nevi Halcour', key: '10A', bars: 128 },
  { seed: 2102, name: 'Lantern Relay', artist: 'Quill Marrow', key: '11A', bars: 128 },
  { seed: 4391, name: 'Quiet Engine Room', artist: 'Tavo Lindqvar', key: '12A', bars: 128 },
  { seed: 1104, name: 'Velvet Circuitry', artist: 'Idra Kalmes', key: '1A', bars: 128 },
];

// ---------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A stateless hash for per-hit variation (noise-buffer offsets), so scheduling order never
// changes the sound.
function hash01(a, b) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function pick(R, arr) { return arr[Math.floor(R() * arr.length) % arr.length]; }
function pickWeighted(R, pairs) {
  let tot = 0;
  for (const p of pairs) tot += p[1];
  let x = R() * tot;
  for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; }
  return pairs[pairs.length - 1][0];
}

// Camelot wheel → pitch class (C = 0). 8A = A minor, 8B = C major.
const CAMELOT = { A: [8, 3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1], B: [11, 6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4] };
const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PC_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function parseKey(key) {
  const s = String(key == null ? '8A' : key).trim();
  let m = /^(\d{1,2})\s*([AaBb])$/.exec(s);
  if (m) {
    const n = (((+m[1] - 1) % 12) + 12) % 12;
    const ab = m[2].toUpperCase();
    return { pc: CAMELOT[ab][n], minor: ab === 'A', label: `${n + 1}${ab}` };
  }
  m = /^([A-Ga-g])([#b]?)\s*(m|min|minor)?$/.exec(s);
  if (m) {
    const pc = (NOTE_PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    return { pc, minor: !!m[3], label: s };
  }
  return { pc: 9, minor: true, label: '8A' };
}

// ---------------------------------------------------------------------------------------
// The track generator. Everything a track "is" lives in this object; the scheduler and the
// waveform both read it through stepEvents(), so they cannot drift apart.
// ---------------------------------------------------------------------------------------
const HAT_GROOVES = [
  { name: 'shuffle', beat: [0.42, 0.2, 0.85, 0.26] },   // offbeat-led deep house shuffle
  { name: 'drive', beat: [0.6, 0.3, 0.55, 0.42] },      // straight tech 16ths
  { name: 'skip', beat: [0.4, 0, 0.9, 0.3] },           // swung, second 16th dropped
  { name: 'pulse', beat: [0.55, 0.32, 0.7, 0] },        // three-of-four
];
const BASS_RHYTHMS = [
  { name: 'offbeat', notes: [[2, 2], [6, 2], [10, 2], [14, 2]] },
  { name: 'rolling', notes: [[2, 1], [3, 1], [6, 1], [7, 1], [10, 1], [11, 1], [14, 1], [15, 1]] },
  { name: 'syncopated', notes: [[3, 2], [6, 1], [10, 3], [14, 1]] },
  { name: 'deep-swing', notes: [[2, 3], [7, 1], [10, 2], [13, 2]] },
  { name: 'bounce', notes: [[2, 1], [5, 1], [6, 1], [10, 1], [12, 1], [14, 2]] },
];
const CHORD_SHAPES = {
  m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 17], maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14], sus9: [0, 5, 7, 10, 14], add9: [0, 4, 7, 14],
};
const MINOR_PROGS = [
  { name: 'i9 vamp', chords: [[0, 'm9']] },
  { name: 'i – VI', chords: [[0, 'm9'], [8, 'maj9']] },
  { name: 'i – iv', chords: [[0, 'm7'], [5, 'm9']] },
  { name: 'i – VII', chords: [[0, 'm9'], [10, 'sus9']] },
  { name: 'iv – i', chords: [[5, 'm9'], [0, 'm11']] },
  { name: 'i – III', chords: [[0, 'm11'], [3, 'maj7']] },
];
const MAJOR_PROGS = [
  { name: 'I9 vamp', chords: [[0, 'maj9']] },
  { name: 'I – vi', chords: [[0, 'maj9'], [9, 'm9']] },
  { name: 'IV – I', chords: [[5, 'maj7'], [0, 'add9']] },
];
const STAB_RHYTHMS = [[3, 10], [6, 13], [2, 11], [3, 6, 14], [7, 10]];

// Nearest-to-centre voicing: each chord tone placed in the octave closest to MIDI `centre`.
function voiceChord(rootMidi, shape, centre) {
  const out = [];
  for (const iv of shape) {
    let n = rootMidi + iv;
    while (n - centre > 6) n -= 12;
    while (centre - n > 6) n += 12;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

function buildTrack(spec) {
  const s = spec || {};
  const seed = (s.seed | 0) || 1;
  const R = mulberry32(Math.imul(seed, 2654435761) ^ 0x5bd1e995);
  const key = parseKey(s.key);
  const lengthBars = Math.max(16, Math.floor(s.bars || 128));

  const kick = {
    f: 44 + R() * 11,                 // fundamental 44–55 Hz
    punch: 3.0 + R() * 0.9,           // start pitch multiple
    decay: 0.3 + R() * 0.16,
    click: 0.05 + R() * 0.09,
    level: 0.95,
  };
  const swing = 0.52 + R() * 0.06;    // fraction of an 8th where the off-16th lands
  const groove = pick(R, HAT_GROOVES);
  const hatBar = [];
  for (let i = 0; i < STEPS_PER_BAR; i += 1) hatBar.push(groove.beat[i % 4]);
  for (let k = 0; k < 3; k += 1) {    // seeded ghost / accent variations
    const i = Math.floor(R() * STEPS_PER_BAR);
    hatBar[i] = hatBar[i] > 0 ? hatBar[i] * (0.45 + R() * 0.3) : 0.18 + R() * 0.12;
  }
  const hats = { bar: hatBar, groove: groove.name, decay: 0.07 + R() * 0.06, tone: 7200 + R() * 2600, level: 0.7 };
  const open = { decay: 0.26 + R() * 0.18, level: 0.3, extra: R() < 0.3 ? 15 : -1 };
  const clap = {
    kind: R() < 0.65 ? 'clap' : 'snare',
    tone: 1050 + R() * 650,
    tail: 0.11 + R() * 0.1,
    ghost: R() < 0.3 ? (R() < 0.5 ? 15 : 7) : -1,
    level: 1.05,
  };

  // Harmony first — the bassline follows the chord roots.
  const prog = key.minor ? pick(R, MINOR_PROGS) : pick(R, MAJOR_PROGS);
  const barsPerChord = prog.chords.length === 1 ? 4 : (R() < 0.5 ? 2 : 4);
  const padCentre = 62 + Math.floor(R() * 5);
  const padRoot = 48 + key.pc;
  const chords = prog.chords.map(([deg, q]) => ({
    deg, q, midis: voiceChord(padRoot + deg, CHORD_SHAPES[q], padCentre).slice(0, 5),
  }));
  const style = R() < 0.5 ? 'pad' : 'stab';
  const harm = {
    prog: prog.name, chords, barsPerChord, style,
    stab: pick(R, STAB_RHYTHMS),
    cutoff: style === 'pad' ? 900 + R() * 900 : 1400 + R() * 1400,
    attack: 0.05 + R() * 0.35,
    detune: 5 + R() * 8,
    pump: 0.18 + R() * 0.2,        // pad floor under a kick (sidechain depth)
    level: style === 'pad' ? 0.13 : 0.17,
  };

  const bassRoot = 33 + ((key.pc - 9 + 12) % 12);     // A1..G#2
  const rhythm = pick(R, BASS_RHYTHMS);
  const ivPool = key.minor
    ? [[0, 6], [12, 2], [7, 1.4], [10, 1], [3, 0.8], [-2, 0.6]]
    : [[0, 6], [12, 2], [7, 1.4], [4, 0.8], [9, 0.7], [-1, 0.5]];
  const bassBars = [0, 1].map((b) => rhythm.notes.map(([step, len], i) => ({
    step, len, iv: i === 0 ? 0 : pickWeighted(R, ivPool), vel: i === 0 ? 1 : 0.78 + R() * 0.22,
  })));
  // Bar B varies its last note — the two-bar question/answer every good bassline has.
  const lastB = bassBars[1][bassBars[1].length - 1];
  lastB.iv = pickWeighted(R, [[12, 2], [7, 1.5], [key.minor ? 3 : 4, 1], [10, 1]]);
  // The SUB layer is legato: each note holds until the next one starts (≤ half a bar), so
  // the low end is a continuous line the kick ducks, not a string of attacks from silence.
  // (Measured: attacks-from-silence on the offbeats put ~40% of the 0–344 Hz onset weight
  // half a beat away from the kick, and the Radio tempo detector lost the beat.)
  const flat = [];
  bassBars.forEach((notes, b) => notes.forEach((n) => flat.push({ n, at: b * STEPS_PER_BAR + n.step })));
  flat.forEach((x, i) => {
    const nx = flat[(i + 1) % flat.length];
    const gap = ((nx.at - x.at) + 2 * STEPS_PER_BAR) % (2 * STEPS_PER_BAR) || 2 * STEPS_PER_BAR;
    x.n.sub = Math.min(8, gap);
  });
  const bass = {
    root: bassRoot, rhythm: rhythm.name, bars: bassBars,
    wave: R() < 0.55 ? 'sawtooth' : 'square',
    bite: 0.45 + R() * 0.35,
    cutoff: 240 + R() * 380,
    env: 2 + R() * 3.2,
    q: 1.2 + R() * 5,
    fdecay: 0.07 + R() * 0.12,
    level: 0.3,
    sub: 0.62,                        // sub sine relative to the plucked layer
  };

  let perc = null;
  if (R() < 0.7) {
    const slots = [1, 3, 5, 7, 9, 11, 13, 15, 10, 14];
    const n = 2 + Math.floor(R() * 3);
    const steps = [];
    while (steps.length < n) {
      const st = pick(R, slots);
      if (!steps.includes(st)) steps.push(st);
    }
    const scale = key.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    perc = {
      steps: steps.sort((a, b) => a - b),
      notes: steps.map(() => 62 + key.pc % 12 + pick(R, scale) - (key.pc > 6 ? 12 : 0)),
      decay: 0.05 + R() * 0.07, wave: R() < 0.5 ? 'sine' : 'triangle', level: 0.3,
    };
  }
  const space = 0.14 + R() * 0.16;     // reverb send
  const echo = 0.12 + R() * 0.16;      // tempo-delay send
  // Arrangement: when each layer enters. Drawn LAST so earlier draws (the sound itself) are
  // unchanged by it. Every entry lands on a 4-bar boundary, so phrasing stays DJ-friendly.
  const arr = {
    clapIn: R() < 0.5 ? 4 : 8,
    bassIn: R() < 0.6 ? 4 : 8,
    harmIn: R() < 0.55 ? 8 : 16,
    percIn: pick(R, [8, 16, 24]),
    hatDropBar: R() < 0.5 ? 16 : -1,    // a 4-bar hat-less lift (open hats only) from here
  };

  return {
    spec: s, seed, key, lengthBars, kick, swing, hats, open, clap, harm, bass, perc, space, echo, arr,
    name: s.name || `Track ${seed}`, artist: s.artist || '',
  };
}

// The arrangement. Intro (kick + hats) → bass + clap at bar 4 → harmony + perc at bar 8 →
// a breakdown every 32 bars (bars 28–31, 60–63, …: kick and bass out, pads swell, a riser)
// → a crash on the drop → an outro that strips back to kick + hats for mixing out.
function section(tr, bar) {
  const L = tr.lengthBars;
  const outro = L - 16;
  const cyc = bar % 32;
  const bd = bar >= 16 && bar < outro && cyc >= 28;
  const a = tr.arr;
  const lift = a.hatDropBar >= 0 && bar >= a.hatDropBar && bar < a.hatDropBar + 4;
  return {
    breakdown: bd,
    bdProg: bd ? (cyc - 28) / 4 : 0,
    kick: !bd,
    hats: bd ? 0.45 : lift ? 0 : bar < 2 ? 0.6 : 1,
    open: !bd && bar >= 2 && bar < L - 4,
    clap: !bd && bar >= a.clapIn && bar < L - 8,
    bass: !bd && bar >= a.bassIn && bar < L - 8,
    harm: bar >= a.harmIn && bar < outro,
    perc: !bd && bar >= a.percIn && bar < L - 8,
    crash: bar >= 32 && cyc === 0 && bar <= outro,
    riser: bd && cyc === 30,
  };
}

function chordAt(tr, bar) {
  const h = tr.harm;
  return h.chords[Math.floor(bar / h.barsPerChord) % h.chords.length];
}

// Every event on one 16th step. `dt` is the swing offset in seconds-per-step units (the
// scheduler multiplies by its own step duration). Shared by the scheduler and the waveform.
function stepEvents(tr, step) {
  const ev = [];
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s16 = step % STEPS_PER_BAR;
  if (bar < 0 || bar >= tr.lengthBars) return ev;
  const sec = section(tr, bar);
  const sw = s16 % 2 === 1 ? (tr.swing - 0.5) * 2 : 0;   // swing, in steps
  if (sec.kick && s16 % 4 === 0) ev.push({ v: 'kick', dt: 0, vel: 1, pump: sec.harm });
  if (sec.clap && (s16 === 4 || s16 === 12)) ev.push({ v: 'clap', dt: 0, vel: 1 });
  if (sec.clap && s16 === tr.clap.ghost && bar % 2 === 1) ev.push({ v: 'clap', dt: sw, vel: 0.35 });
  const hv = tr.hats.bar[s16] * sec.hats;
  if (hv > 0.04) ev.push({ v: 'hat', dt: sw, vel: hv });
  if (sec.open && (s16 % 4 === 2 || (s16 === tr.open.extra && bar % 4 === 3))) ev.push({ v: 'open', dt: sw, vel: 1 });
  if (sec.bass) {
    const ch = chordAt(tr, bar);
    let cr = ch.deg;
    if (cr > 6) cr -= 12;
    // A sub note may not ring into a bar that has no bass (a breakdown or the outro).
    const toBarEnd = STEPS_PER_BAR - s16;
    const nextHasBass = section(tr, bar + 1).bass;
    for (const n of tr.bass.bars[bar % 2]) {
      if (n.step === s16) {
        const sub = nextHasBass ? n.sub : Math.min(n.sub, toBarEnd);
        ev.push({ v: 'bass', dt: sw, vel: n.vel, midi: tr.bass.root + cr + n.iv, len: n.len, sub });
      }
    }
  }
  if (sec.harm) {
    const ch = chordAt(tr, bar);
    if (tr.harm.style === 'pad') {
      if (s16 === 0 && bar % tr.harm.barsPerChord === 0) {
        const bars = Math.min(tr.harm.barsPerChord, (tr.lengthBars - 16) - bar);
        ev.push({ v: 'pad', dt: 0, vel: 1, midis: ch.midis, len: bars * STEPS_PER_BAR, swell: sec.breakdown });
      }
    } else if (tr.harm.stab.includes(s16)) {
      ev.push({ v: 'stab', dt: sw, vel: sec.breakdown ? 0.75 : 1, midis: ch.midis, open: sec.breakdown ? 0.5 + sec.bdProg : 0 });
    }
    if (tr.harm.style === 'stab' && sec.breakdown && s16 === 0 && bar % 2 === 0) {
      ev.push({ v: 'pad', dt: 0, vel: 0.8, midis: ch.midis, len: 2 * STEPS_PER_BAR, swell: true });
    }
  }
  if (sec.perc && tr.perc) {
    const i = tr.perc.steps.indexOf(s16);
    if (i >= 0) ev.push({ v: 'perc', dt: sw, vel: 1, midi: tr.perc.notes[i] });
  }
  if (sec.crash && s16 === 0) ev.push({ v: 'crash', dt: 0, vel: 1 });
  if (sec.riser && s16 === 0) ev.push({ v: 'riser', dt: 0, vel: 1, len: 2 * STEPS_PER_BAR });
  return ev;
}

/** A plain summary of what a spec generates (for UI / tests). */
export function describeTrack(spec) {
  const tr = buildTrack(spec);
  const keyName = `${PC_NAME[tr.key.pc]}${tr.key.minor ? 'm' : ''}`;
  return {
    name: tr.name, artist: tr.artist, key: tr.key.label, keyName, lengthBars: tr.lengthBars,
    kickHz: +tr.kick.f.toFixed(1), swing: +tr.swing.toFixed(3), hatGroove: tr.hats.groove,
    clap: tr.clap.kind, bassRhythm: tr.bass.rhythm, bassWave: tr.bass.wave,
    bassCutoff: Math.round(tr.bass.cutoff), progression: tr.harm.prog, harmony: tr.harm.style,
    chords: tr.harm.chords.map((c) => `${c.q}@${c.deg}`), perc: tr.perc ? tr.perc.steps.slice() : null,
    arrangement: { ...tr.arr },
  };
}

// ---------------------------------------------------------------------------------------
// trackWaveform — per-16th {low, mid, high} from the pattern itself, for deck overviews.
// ---------------------------------------------------------------------------------------
// Band weights per voice, calibrated against the rendered audio (see dist/audio-test).
const WAVE_MODEL = {
  kick: { low: [1.0, 0.95, 0], mid: [0.12, 1, 0], high: [0.02, 0.6, 0] },
  clap: { low: [0, 1, 0], mid: [0.38, 1.4, 0], high: [0.3, 1.1, 0] },
  hat: { low: [0, 1, 0], mid: [0.015, 0.5, 0], high: [0.26, 0.6, 0] },
  open: { low: [0, 1, 0], mid: [0.02, 1, 0], high: [0.32, 1.4, 0] },
  perc: { low: [0.03, 0.7, 0], mid: [0.15, 0.7, 0], high: [0.02, 0.5, 0] },
  stab: { low: [0.02, 1, 0], mid: [0.32, 1.6, 0], high: [0.05, 1.2, 0] },
  crash: { low: [0, 1, 0], mid: [0.05, 5, 0], high: [0.35, 9, 0] },
};
function addDecay(arr, i, amp, decay, hold) {
  if (!(amp > 0)) return;
  const n = Math.min(arr.length, i + hold + Math.ceil(decay * 4) + 1);
  for (let k = i; k < n; k += 1) {
    const x = k - i - hold;
    arr[k] += x <= 0 ? amp : amp * Math.exp(-x / Math.max(0.2, decay));
  }
}
/**
 * @param {object} spec  a track spec
 * @param {number} [bars] how many bars to describe (default spec.bars)
 * @returns {Array<{low:number,mid:number,high:number}>} one entry per 16th, each 0..1
 */
export function trackWaveform(spec, bars) {
  const tr = buildTrack(spec);
  const nBars = Math.max(1, Math.floor(bars || tr.lengthBars));
  const N = nBars * STEPS_PER_BAR;
  const low = new Float32Array(N), mid = new Float32Array(N), high = new Float32Array(N);
  for (let st = 0; st < N; st += 1) {
    for (const e of stepEvents(tr, st)) {
      const w = WAVE_MODEL[e.v];
      if (w) {
        addDecay(low, st, w.low[0] * e.vel, w.low[1], w.low[2]);
        addDecay(mid, st, w.mid[0] * e.vel, w.mid[1], w.mid[2]);
        addDecay(high, st, w.high[0] * e.vel, w.high[1], w.high[2]);
      } else if (e.v === 'bass') {
        // plucked layer: a short burst of mid; legato sub: flat until the next note, ducked
        // under every kick on the same beat grid the engine ducks it on.
        addDecay(mid, st, 0.1 * e.vel, 1.5, 0);
        const kickOn = section(tr, Math.floor(st / STEPS_PER_BAR)).kick;
        for (let k = 0; k < e.sub && st + k < N; k += 1) {
          const duck = kickOn && (st + k) % 4 === 0 ? 0.3 : 1;
          low[st + k] += 0.2 * e.vel * duck;
        }
      } else if (e.v === 'pad') {
        // Sustained pad, ducked by the kick on each beat (the sidechain pump).
        const kickOn = section(tr, Math.floor(st / STEPS_PER_BAR)).kick;
        for (let k = 0; k < e.len && st + k < N; k += 1) {
          const inBeat = (st + k) % 4;
          const duck = kickOn && !e.swell ? [tr.harm.pump + 0.1, 0.7, 0.92, 1][inBeat] : 1;
          const sw = e.swell ? 0.6 + 0.8 * (k / e.len) : 1;
          mid[st + k] += 0.32 * e.vel * duck * sw;
          low[st + k] += 0.03 * e.vel * duck;
          high[st + k] += 0.02 * e.vel * sw;
        }
      } else if (e.v === 'riser') {
        for (let k = 0; k < e.len && st + k < N; k += 1) {
          const p = k / e.len;
          mid[st + k] += 0.12 * p;
          high[st + k] += 0.3 * p * p;
        }
      }
    }
  }
  const sat = (x, g) => 1 - Math.exp(-x * g);
  const out = new Array(N);
  // Low is kept linear (the kick is the reference level); mid/high saturate gently.
  for (let i = 0; i < N; i += 1) out[i] = { low: Math.min(1, low[i] * 0.88), mid: sat(mid[i], 2.2), high: sat(high[i], 2.4) };
  return out;
}

// ---------------------------------------------------------------------------------------
// Buffer decks — the pure half (no Web Audio; unit-tested in node)
// ---------------------------------------------------------------------------------------
/**
 * Validate + complete a track-analysis meta for a buffer of `durationSec` seconds.
 * beatSec is ALWAYS 60 / bpm (the contract's definition — one source of truth, so a
 * rounded beatSec can never disagree with the bpm the beat-match uses). lengthBars, when
 * absent, is the whole bars from downbeatSec to the end of the audio.
 * @returns {object|null} a copy of meta with { bpm, beatSec, downbeatSec, lengthBars }, or null
 */
export function normalizeBufferMeta(meta, durationSec) {
  const m = meta || {};
  const trackBpm = Number(m.bpm);
  if (!(trackBpm > 0 && trackBpm < 1000)) return null;
  const dur = Number(durationSec);
  if (!(dur > 0)) return null;
  const beatSec = 60 / trackBpm;
  const downbeatSec = m.downbeatSec != null && Number.isFinite(Number(m.downbeatSec)) ? Number(m.downbeatSec) : 0;
  const fit = Math.max(0, Math.floor((dur - downbeatSec) / (4 * beatSec) + 1e-9));
  const lengthBars = m.lengthBars != null && Number(m.lengthBars) > 0 ? Number(m.lengthBars) : fit;
  return { ...m, bpm: trackBpm, beatSec, downbeatSec, lengthBars };
}

/**
 * Where and when a buffer deck's source must start so track bar `fromBar` lands on master
 * bar `atBar`. Buffer time b sounds at  atT + (b − cue) / rate  (cue = downbeatSec +
 * fromBar·4·beatSec). If that start is behind `now + lead` the deck JOINS LATE: it starts at
 * now + lead with the offset advanced by the elapsed time × rate — still on the grid.
 * `rate` is rounded to float32 because AudioParam.value is float32: the arithmetic here must
 * match what the node actually does, or `endT` drifts from the audio.
 * @param {{engineBpm:number, t0:number, meta:object, duration:number, now:number,
 *          atBar?:number, fromBar?:number, lead?:number}} o  meta must be normalizeBufferMeta'd
 */
export function planBufferStart(o) {
  const m = o.meta;
  const barDur = 240 / o.engineBpm;
  const lead = Number.isFinite(o.lead) ? o.lead : BUF_LEAD;
  const rate = Math.fround(o.engineBpm / m.bpm);
  const fromBar = Math.max(0, Number(o.fromBar) || 0);
  const atBar = Number.isFinite(o.atBar) ? o.atBar : Math.ceil((o.now + lead - o.t0) / barDur - 1e-9);
  const atT = o.t0 + atBar * barDur;
  const cue = m.downbeatSec + fromBar * 4 * m.beatSec;
  let startT = atT;
  let offset = cue;
  if (offset < 0) { startT = atT - offset / rate; offset = 0; }   // grid extrapolated before 0 s
  let late = false;
  if (startT < o.now + lead) {
    late = true;
    offset += (o.now + lead - startT) * rate;
    startT = o.now + lead;
  }
  const ok = offset < o.duration;
  const endT = ok ? startT + (o.duration - offset) / rate : startT;
  return { ok, rate, atBar, atT, fromBar, cue, startT, offset, late, endT };
}

// ---------------------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------------------
function softCurve(k, n) {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i += 1) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  return c;
}
// Transparent below 0.8; above it a smooth knee that can never exceed ≈0.94.
function safetyCurve(n) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = a < 0.8 ? x : Math.sign(x) * (0.8 + 0.17 * Math.tanh((a - 0.8) / 0.17));
  }
  return c;
}
function eqDb(v) {
  const x = clamp(Number(v) || 0, -1, 1);
  return x >= 0 ? x * EQ_BOOST_DB : EQ_KILL_DB * Math.pow(-x, 1.5);
}
const faderGain = (f) => Math.sin(clamp(Number(f) || 0, 0, 1) * Math.PI / 2);

/**
 * @param {{ctx: BaseAudioContext, bpm?: number, t0?: number, autoSchedule?: boolean,
 *          safetyClip?: boolean, destination?: AudioNode, bufferTrim?: number}} opts
 *   bufferTrim: the default linear trim for buffer decks (BUFFER_TRIM when omitted)
 */
export function createDeckAudio(opts) {
  const o = opts || {};
  const ctx = o.ctx;
  if (!ctx) throw new Error('createDeckAudio: ctx is required');
  const bpm = Number(o.bpm) > 0 ? Number(o.bpm) : 124;
  const beatDur = 60 / bpm;
  const stepDur = beatDur / 4;
  const barDur = beatDur * 4;
  const isOffline = typeof ctx.startRendering === 'function';
  const autoSchedule = o.autoSchedule == null ? !isOffline : !!o.autoSchedule;
  const t0 = Number.isFinite(o.t0) ? o.t0 : ctx.currentTime + 0.1;
  const stats = { scheduledSteps: 0, droppedSteps: 0, late: 0, sources: 0, maxLookahead: LOOKAHEAD_MIN, bufferStarts: 0, lateJoins: 0 };
  const bufferTrim = Number(o.bufferTrim) >= 0 && o.bufferTrim != null ? Number(o.bufferTrim) : BUFFER_TRIM;
  const bufLead = Math.max(BUF_LEAD, 2 * (Number(ctx.baseLatency) || 0));
  const owned = [];            // persistent nodes, disconnected on dispose
  const keep = (n) => { owned.push(n); return n; };

  // Shared seeded white noise (2 s, mono).
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  {
    const d = noise.getChannelData(0);
    const R = mulberry32(0x51a9e);
    for (let i = 0; i < d.length; i += 1) d[i] = R() * 2 - 1;
  }
  function impulse(seed, secs) {
    const len = Math.floor(ctx.sampleRate * secs);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = b.getChannelData(ch);
      const R = mulberry32(seed + ch * 7919);
      let lp = 0;
      for (let i = 0; i < len; i += 1) {
        const t = i / ctx.sampleRate;
        const damp = 0.55 - 0.45 * Math.min(1, t / secs);   // darker as it decays
        lp += damp * ((R() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-t / (secs * 0.28));
      }
    }
    return b;
  }

  // ---- master ------------------------------------------------------------------------
  const master = keep(ctx.createGain());
  master.gain.value = 1;
  const clip = keep(ctx.createWaveShaper());
  clip.curve = o.safetyClip === false ? null : safetyCurve(4097);
  clip.oversample = 'none';
  const analyser = keep(ctx.createAnalyser());
  analyser.fftSize = 512;
  master.connect(clip);
  clip.connect(analyser);
  analyser.connect(o.destination || ctx.destination);

  // ---- decks -------------------------------------------------------------------------
  function biquad(type, f, q, gain) {
    const b = keep(ctx.createBiquadFilter());
    b.type = type; b.frequency.value = f;
    if (q != null) b.Q.value = q;
    if (gain != null) b.gain.value = gain;
    return b;
  }
  function makeDeck(idx) {
    const d = { idx, curStep: 0, tr: null, loaded: false, playing: false, startT: 0, startBar: 0, nextStep: 0, stopAt: null, sources: [], last: {} };
    // Buffer-deck state (kind 'buffer'); bufIn is created on the first loadBuffer, so an
    // engine that only ever plays synthesized tracks keeps exactly its original graph.
    Object.assign(d, { kind: 'synth', buf: null, meta: null, info: null, bufIn: null, bufSrc: null, bufPlan: null, bufOpenT: 0, gateHold: 0 });
    d.mix = keep(ctx.createGain()); d.mix.gain.value = DECK_TRIM;
    d.gate = keep(ctx.createGain()); d.gate.gain.value = 0;
    d.low = biquad('lowshelf', 200, null, 0);
    d.midEq = biquad('peaking', 1000, 0.7, 0);
    d.high = biquad('highshelf', 5000, null, 0);
    d.analyser = keep(ctx.createAnalyser()); d.analyser.fftSize = 512; d.analyser.smoothingTimeConstant = 0.6;
    d.fader = keep(ctx.createGain()); d.fader.gain.value = 1;
    d.xf = keep(ctx.createGain()); d.xf.gain.value = Math.SQRT1_2;
    d.mix.connect(d.gate); d.gate.connect(d.low); d.low.connect(d.midEq); d.midEq.connect(d.high);
    d.high.connect(d.analyser); d.high.connect(d.fader); d.fader.connect(d.xf); d.xf.connect(master);

    // Voice buses (static filters, so a hit costs only a source + a gain).
    d.kickBus = keep(ctx.createWaveShaper()); d.kickBus.curve = softCurve(1.5, 2049);
    d.kickBus.connect(d.mix);
    d.clickBus = biquad('highpass', 1800, 0.7); d.clickBus.connect(d.mix);
    d.hatBus = biquad('highpass', 7000, 0.7);
    d.hatLp = biquad('lowpass', 14000, 0.7); d.hatPan = keep(ctx.createStereoPanner()); d.hatPan.pan.value = 0.12;
    d.hatBus.connect(d.hatLp); d.hatLp.connect(d.hatPan); d.hatPan.connect(d.mix);
    d.openBus = biquad('highpass', 6000, 0.7);
    d.openPk = biquad('peaking', 9000, 1, -3); d.openPan = keep(ctx.createStereoPanner()); d.openPan.pan.value = -0.1;
    d.openBus.connect(d.openPk); d.openPk.connect(d.openPan); d.openPan.connect(d.mix);
    d.clapBus = biquad('bandpass', 1300, 0.8);
    d.clapHp = biquad('highpass', 500, 0.7);
    d.clapBus.connect(d.clapHp); d.clapHp.connect(d.mix);
    d.bassBus = keep(ctx.createGain()); d.bassBus.connect(d.mix);   // gain = the kick's sidechain duck
    // The plucked layer is high-passed so the lowest octave belongs to the sub and the kick.
    d.pluckHp = biquad('highpass', 130, 0.7); d.pluckHp.connect(d.bassBus);
    // Pads and stabs are high-passed out of the kick/bass range (and so out of the 0–344 Hz
    // band the Radio tempo detector listens to — their sidechain swell would otherwise read
    // as an onset just after every kick).
    d.padIn = keep(ctx.createGain());
    d.padHp = biquad('highpass', 280, 0.7);
    d.padLp = biquad('lowpass', 1200, 0.6);
    d.pump = keep(ctx.createGain()); d.pump.gain.value = 1;
    d.padIn.connect(d.padHp); d.padHp.connect(d.padLp); d.padLp.connect(d.pump); d.pump.connect(d.mix);
    d.stabBus = keep(ctx.createGain());
    d.stabHp = biquad('highpass', 240, 0.7);
    d.stabBus.connect(d.stabHp); d.stabHp.connect(d.mix);
    d.percBus = keep(ctx.createStereoPanner()); d.percBus.pan.value = -0.28; d.percBus.connect(d.mix);
    // Space: a short dark room and a dotted-8th echo, both returning before the gate.
    d.verbSend = keep(ctx.createGain()); d.verbSend.gain.value = 0.2;
    d.verb = keep(ctx.createConvolver()); d.verb.buffer = impulse(0x3e11 + idx * 131, 1.7);
    d.verbRet = keep(ctx.createGain()); d.verbRet.gain.value = 0.9;
    d.verbSend.connect(d.verb); d.verb.connect(d.verbRet); d.verbRet.connect(d.mix);
    d.echoSend = keep(ctx.createGain()); d.echoSend.gain.value = 0.2;
    d.echo = keep(ctx.createDelay(2)); d.echo.delayTime.value = beatDur * 0.75;
    d.echoFb = keep(ctx.createGain()); d.echoFb.gain.value = 0.34;
    d.echoHp = biquad('highpass', 350, 0.7); d.echoLp = biquad('lowpass', 2600, 0.7);
    d.echoSend.connect(d.echo); d.echo.connect(d.echoHp); d.echoHp.connect(d.echoLp);
    d.echoLp.connect(d.echoFb); d.echoFb.connect(d.echo); d.echoLp.connect(d.mix);
    d.clapHp.connect(d.verbSend); d.pump.connect(d.verbSend); d.stabHp.connect(d.verbSend);
    d.stabHp.connect(d.echoSend); d.percBus.connect(d.echoSend); d.percBus.connect(d.verbSend);
    return d;
  }
  const decks = [makeDeck(0), makeDeck(1)];
  const deckPlaying = [false, false];
  const deckAnalysers = decks.map((d) => d.analyser);

  // ---- voices ------------------------------------------------------------------------
  function track(d, src, start, end) {
    if (start < ctx.currentTime - 1e-6) stats.late += 1;
    d.sources.push({ src, start, end });
    stats.sources += 1;
  }
  function noiseHit(d, out, t, dur, env, salt) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const g = ctx.createGain();
    env(g.gain);
    src.connect(g); g.connect(out);
    const off = hash01(salt + d.idx * 1009, d.curStep) * (noise.duration - dur - 0.05);
    src.start(t, Math.max(0, off), dur);
    track(d, src, t, t + dur);
    return g;
  }
  function vKick(d, t, vel) {
    const k = d.tr.kick;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(k.f * k.punch, t);
    o.frequency.exponentialRampToValueAtTime(k.f * 1.35, t + 0.028);
    o.frequency.exponentialRampToValueAtTime(k.f, t + 0.11);
    const g = ctx.createGain();
    const a = vel * k.level;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.0025);
    g.gain.setValueAtTime(a, t + 0.035);
    g.gain.exponentialRampToValueAtTime(a * 0.42, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0006, t + k.decay);
    o.connect(g); g.connect(d.kickBus);
    o.start(t); o.stop(t + k.decay + 0.02);
    track(d, o, t, t + k.decay + 0.02);
    noiseHit(d, d.clickBus, t, 0.012, (p) => { p.setValueAtTime(k.click * vel, t); p.exponentialRampToValueAtTime(0.0005, t + 0.008); }, 11);
  }
  function vHat(d, t, vel) {
    const h = d.tr.hats;
    // `decay` is the time to −60 dB (a real closed hat: τ ≈ 10–20 ms, not a click).
    noiseHit(d, d.hatBus, t, h.decay + 0.02, (p) => { p.setValueAtTime(vel * h.level, t); p.exponentialRampToValueAtTime(vel * h.level * 0.001, t + h.decay); }, 23);
  }
  function vOpen(d, t, vel) {
    const h = d.tr.open;
    noiseHit(d, d.openBus, t, h.decay + 0.02, (p) => {
      p.setValueAtTime(0, t); p.linearRampToValueAtTime(vel * h.level, t + 0.003);
      p.exponentialRampToValueAtTime(vel * h.level * 0.001, t + h.decay);
    }, 29);
  }
  function vClap(d, t, vel) {
    const c = d.tr.clap;
    const v = vel * c.level;
    noiseHit(d, d.clapBus, t, c.tail + 0.06, (p) => {
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(v, t + 0.001);
      p.exponentialRampToValueAtTime(v * 0.15, t + 0.009);
      p.setValueAtTime(v * 0.8, t + 0.011);
      p.exponentialRampToValueAtTime(v * 0.12, t + 0.02);
      p.setValueAtTime(v * 0.9, t + 0.022);
      p.setTargetAtTime(0, t + 0.0235, c.tail / 4);
    }, 31);
    if (c.kind === 'snare') {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28 * vel, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
      o.connect(g); g.connect(d.mix); o.start(t); o.stop(t + 0.1);
      track(d, o, t, t + 0.1);
    }
  }
  // Two layers, the way a house bass is actually built: a plucked mid layer (saw/square
  // through an enveloped low-pass) that carries the rhythm, and a legato sine sub that holds
  // until the next note so the low end is continuous. The whole bus is ducked by the kick.
  function vBass(d, t, dur, subDur, midi, vel) {
    const b = d.tr.bass;
    const f = mtof(midi);
    const a = vel * b.level;
    // plucked layer
    const o2 = ctx.createOscillator(); o2.type = b.wave; o2.frequency.value = f; o2.detune.value = 4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = b.q;
    lp.frequency.setValueAtTime(Math.min(8000, b.cutoff * b.env), t);
    lp.frequency.setTargetAtTime(b.cutoff, t + 0.003, b.fdecay / 3);
    const gm = ctx.createGain();
    gm.gain.setValueAtTime(0, t);
    gm.gain.linearRampToValueAtTime(a * b.bite, t + 0.005);
    gm.gain.setTargetAtTime(a * b.bite * 0.6, t + 0.007, 0.1);
    gm.gain.setTargetAtTime(0, t + dur, 0.018);
    o2.connect(lp); lp.connect(gm); gm.connect(d.pluckHp);
    const endM = t + dur + 0.12;
    o2.start(t); o2.stop(endM);
    track(d, o2, t, endM);
    // legato sub
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const gs = ctx.createGain();
    const as = a * b.sub;
    gs.gain.setValueAtTime(0, t);
    gs.gain.linearRampToValueAtTime(as, t + 0.01);
    gs.gain.setValueAtTime(as, t + Math.max(0.011, subDur - 0.002));
    gs.gain.setTargetAtTime(0, t + subDur, 0.012);
    o1.connect(gs); gs.connect(d.bassBus);
    const endS = t + subDur + 0.1;
    o1.start(t); o1.stop(endS);
    track(d, o1, t, endS);
  }
  function vPad(d, t, dur, midis, vel, swell) {
    const h = d.tr.harm;
    const g = ctx.createGain();
    const a = vel * h.level * (4 / Math.max(3, midis.length));
    const atk = swell ? dur * 0.6 : h.attack;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + atk);
    g.gain.setValueAtTime(a, t + Math.max(atk, dur - 0.02));
    g.gain.setTargetAtTime(0, t + dur, 0.12);
    const pl = ctx.createStereoPanner(); pl.pan.value = -0.4;
    const pr = ctx.createStereoPanner(); pr.pan.value = 0.4;
    pl.connect(g); pr.connect(g); g.connect(d.padIn);
    const end = t + dur + 0.6;
    for (const m of midis) {
      for (const side of [-1, 1]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mtof(m); o.detune.value = side * h.detune;
        o.connect(side < 0 ? pl : pr);
        o.start(t); o.stop(end);
        track(d, o, t, end);
      }
    }
    // A breakdown opens the pad filter across the swell, then lets it settle on the drop.
    if (swell) {
      d.padLp.frequency.setTargetAtTime(h.cutoff * 2.6, t, dur / 3);
      d.padLp.frequency.setTargetAtTime(h.cutoff, t + dur, 0.4);
    }
  }
  function vStab(d, t, midis, vel, openAmt) {
    const h = d.tr.harm;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
    const top = h.cutoff * (1.8 + (openAmt || 0));
    lp.frequency.setValueAtTime(top, t);
    lp.frequency.setTargetAtTime(h.cutoff * 0.5, t + 0.004, 0.06);
    const g = ctx.createGain();
    const a = vel * h.level * (4 / Math.max(3, midis.length));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.012, 0.07);
    lp.connect(g); g.connect(d.stabBus);
    const end = t + 0.45;
    midis.forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = mtof(m); o.detune.value = (i % 2 ? 1 : -1) * h.detune;
      o.connect(lp); o.start(t); o.stop(end);
      track(d, o, t, end);
    });
  }
  function vPerc(d, t, midi) {
    const p = d.tr.perc;
    const f = mtof(midi);
    const o = ctx.createOscillator(); o.type = p.wave;
    o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.018);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0004, t + p.decay);
    o.connect(g); g.connect(d.percBus);
    o.start(t); o.stop(t + p.decay + 0.02);
    track(d, o, t, t + p.decay + 0.02);
  }
  function vCrash(d, t) {
    noiseHit(d, d.openBus, t, 1.9, (p) => { p.setValueAtTime(0.11, t); p.exponentialRampToValueAtTime(0.0005, t + 1.8); }, 37);
  }
  function vRiser(d, t, dur) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.97);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp); bp.connect(g); g.connect(d.mix); g.connect(d.verbSend);
    src.start(t); src.stop(t + dur);
    track(d, src, t, t + dur);
  }
  // Sidechain pump: the pad bus ducks on every kick and breathes back before the next one.
  function vPump(d, t, pad) {
    if (pad) {
      const p = d.pump.gain;
      p.setTargetAtTime(d.tr.harm.pump, t, 0.004);
      p.setTargetAtTime(1, t + 0.035, 0.085);
    }
    const q = d.bassBus.gain;           // the bass always ducks under the kick
    q.setTargetAtTime(0.28, t - 0.002 > 0 ? t - 0.002 : t, 0.003);
    q.setTargetAtTime(1, t + 0.05, 0.05);
  }

  // Test-only: `_mute` is a list of voice names to skip (diagnostics; never set in the app).
  const mute = new Set(Array.isArray(o._mute) ? o._mute : []);
  function playStep(d, step, tStep) {
    d.curStep = step;
    for (const e of stepEvents(d.tr, step)) {
      if (mute.has(e.v)) continue;
      const t = tStep + e.dt * stepDur;
      switch (e.v) {
        case 'kick': vKick(d, t, e.vel); vPump(d, t, e.pump); break;
        case 'hat': vHat(d, t, e.vel); break;
        case 'open': vOpen(d, t, e.vel); break;
        case 'clap': vClap(d, t, e.vel); break;
        case 'bass': vBass(d, t, e.len * stepDur * 0.92, e.sub * stepDur, e.midi, e.vel); break;
        case 'pad': vPad(d, t, e.len * stepDur, e.midis, e.vel, e.swell); break;
        case 'stab': vStab(d, t, e.midis, e.vel, e.open); break;
        case 'perc': vPerc(d, t, e.midi); break;
        case 'crash': vCrash(d, t); break;
        case 'riser': vRiser(d, t, e.len * stepDur); break;
        default: break;
      }
    }
  }

  // ---- the clock + scheduler --------------------------------------------------------
  const barTime = (bar) => t0 + bar * barDur;
  const barAt = (t) => (t - t0) / barDur;
  let lookahead = LOOKAHEAD_MIN;

  function scheduleDeck(d, until) {
    if (!d.playing || !d.tr) return;
    const now = ctx.currentTime;
    const total = d.tr.lengthBars * STEPS_PER_BAR;
    while (d.nextStep < total) {
      const ts = d.startT + d.nextStep * stepDur;
      if (ts >= until) break;
      if (d.stopAt != null && ts >= d.stopAt - 1e-6) break;
      if (ts < now + MIN_LEAD) { stats.droppedSteps += 1; d.nextStep += 1; continue; }
      playStep(d, d.nextStep, ts);
      stats.scheduledSteps += 1;
      d.nextStep += 1;
    }
    // The track has an end: close the gate after the last bar rings out.
    if (d.nextStep >= total && d.stopAt == null) {
      d.stopAt = d.startT + total * stepDur;
      closeGate(d, d.stopAt);
    }
  }
  function refreshPlaying() {
    const now = ctx.currentTime;
    for (const d of decks) {
      if (d.playing && d.stopAt != null && now >= d.stopAt) d.playing = false;
      deckPlaying[d.idx] = d.playing;
      // prune finished sources
      if (d.sources.length > 64) d.sources = d.sources.filter((s) => s.end > now);
    }
  }
  /** Schedule everything up to `until` (ctx seconds). Realtime mode calls this on a timer. */
  function pump(until) {
    const u = Number.isFinite(until) ? until : ctx.currentTime + lookahead;
    for (const d of decks) scheduleDeck(d, u);
    refreshPlaying();
  }

  let timer = null;
  let lastTick = null;
  let visHandler = null;
  if (autoSchedule) {
    timer = setInterval(() => {
      const now = ctx.currentTime;
      if (lastTick != null && ctx.state === 'running') {
        const gap = now - lastTick;
        // A late tick means the timer is being throttled: widen the horizon so the NEXT late
        // tick still finds audio queued; relax back slowly once ticks are regular again.
        const want = clamp(gap * 1.6 + 0.02, LOOKAHEAD_MIN, LOOKAHEAD_MAX);
        lookahead = want > lookahead ? want : Math.max(LOOKAHEAD_MIN, lookahead * 0.97);
        if (lookahead > stats.maxLookahead) stats.maxLookahead = lookahead;
      }
      lastTick = now;
      pump(now + lookahead);
    }, TICK_MS);
    if (typeof document !== 'undefined' && document.addEventListener) {
      visHandler = () => { if (document.hidden) { lookahead = LOOKAHEAD_MAX; pump(ctx.currentTime + lookahead); } };
      document.addEventListener('visibilitychange', visHandler);
    }
  }

  function closeGate(d, T) {
    d.gate.gain.cancelScheduledValues(T);
    d.gate.gain.setTargetAtTime(0, T, 0.006);
  }
  // Silence (never start) anything this deck had queued at or after T.
  function cutFrom(d, T) {
    for (const s of d.sources) {
      if (s.start >= T - 1e-6) { try { s.src.stop(ctx.currentTime); } catch (e) { /* already stopped */ } }
    }
    d.sources = d.sources.filter((s) => s.start < T - 1e-6);
  }

  // ---- buffer decks -------------------------------------------------------------------
  function bufInFor(d) {
    if (!d.bufIn) { d.bufIn = keep(ctx.createGain()); d.bufIn.connect(d.gate); }
    return d.bufIn;
  }
  const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  // Per-track trim, first match wins: info.trim · info.trimDb · info.lufs · meta.trim ·
  // meta.trimDb · meta.lufs · the engine default. `lufs` = the file's integrated loudness.
  function pickTrim(info, meta) {
    for (const src of [info, meta]) {
      if (!src) continue;
      const lin = num(src.trim);
      if (lin != null && lin >= 0) return lin;
      const dbv = num(src.trimDb);
      if (dbv != null) return Math.pow(10, dbv / 20);
      const lufs = num(src.lufs);
      if (lufs != null) return Math.pow(10, (BUFFER_TARGET_LUFS - lufs) / 20);
    }
    return bufferTrim;
  }
  // The gate's value at `t` under the automation playBuffer wrote (open → end fade).
  const bufGateAt = (d, t) => (d.bufPlan && t >= d.bufOpenT && t < d.bufPlan.endT - BUF_FADE_OUT ? 1 : 0);

  /**
   * Load a decoded AudioBuffer on `deck`. `meta` = the track-analysis contract (only bpm and
   * downbeatSec are required); `info` = { name, artist, key, trim?, trimDb?, lufs? }.
   * Returns false (deck untouched) when meta has no usable bpm.
   */
  function loadBuffer(deck, audioBuffer, meta, info) {
    const d = decks[deck];
    if (!d || !audioBuffer || !(audioBuffer.duration > 0)) return false;
    const m = normalizeBufferMeta(meta, audioBuffer.duration);
    if (!m) return false;
    const synthWasPlaying = d.playing && d.kind === 'synth';
    if (d.playing) stop(deck);
    // A synth stop fades the gate over ~50 ms from now (setTarget, τ 6 ms); keep that fade
    // intact if this buffer is played straight away.
    if (synthWasPlaying) d.gateHold = Math.max(d.gateHold, ctx.currentTime + MIN_LEAD + 0.05);
    const inf = info || {};
    // The previous source (if any) keeps the stop it was given; it disconnects itself on 'ended'.
    Object.assign(d, { kind: 'buffer', tr: null, buf: audioBuffer, meta: m, bufSrc: null, bufPlan: null, loaded: true, nextStep: 0, stopAt: null });
    d.info = {
      name: inf.name != null ? String(inf.name) : m.name != null ? String(m.name) : 'Untitled',
      artist: inf.artist != null ? String(inf.artist) : m.artist != null ? String(m.artist) : '',
      key: inf.key != null ? String(inf.key) : m.key != null ? String(m.key) : null,
    };
    d.trim = pickTrim(inf, m);
    bufInFor(d).gain.setValueAtTime(d.trim, Math.max(ctx.currentTime, d.gateHold));
    return true;
  }
  function playBuffer(d, p) {
    if (d.playing) stop(d.idx);
    const now = ctx.currentTime;
    const plan = planBufferStart({ engineBpm: bpm, t0, meta: d.meta, duration: d.buf.duration, now, atBar: p.atBar, fromBar: p.fromBar, lead: bufLead });
    if (!plan.ok) return false;
    const src = ctx.createBufferSource();
    src.buffer = d.buf;
    src.playbackRate.value = plan.rate;
    src.connect(bufInFor(d));
    if (plan.startT < ctx.currentTime - 1e-6) stats.late += 1;   // unreachable by construction
    src.start(plan.startT, plan.offset);
    stats.sources += 1;
    stats.bufferStarts += 1;
    if (plan.late) stats.lateJoins += 1;
    src.onended = () => {
      try { src.disconnect(); } catch (e) { /* fine */ }
      if (d.bufSrc === src) { d.bufSrc = null; d.playing = false; deckPlaying[d.idx] = false; }
    };
    // Gate: shut until the start, open ON it (a late join ramps over BUF_FADE_IN because it
    // lands mid-waveform), and close over the last BUF_FADE_OUT of the buffer. Automation a
    // previous stop wrote (its fade, up to gateHold) is kept, never cancelled.
    const g = d.gate.gain;
    const from = Math.max(now, d.gateHold + 1e-5);
    g.cancelScheduledValues(from);
    let openT;
    if (plan.late) {
      g.setValueAtTime(0, plan.startT);
      g.linearRampToValueAtTime(1, plan.startT + BUF_FADE_IN);
      openT = plan.startT + BUF_FADE_IN;
    } else {
      openT = Math.max(from, plan.startT - 0.002);
      g.setValueAtTime(0, Math.max(from, openT - 0.002));
      g.setValueAtTime(1, openT);
    }
    g.setValueAtTime(1, Math.max(openT, plan.endT - BUF_FADE_OUT));
    g.linearRampToValueAtTime(0, plan.endT);
    Object.assign(d, {
      bufSrc: src, bufPlan: plan, bufOpenT: openT,
      startBar: plan.atBar, startT: plan.atT - plan.fromBar * barDur,   // master time of track bar 0
      stopAt: plan.endT, playing: true,
    });
    deckPlaying[d.idx] = true;
    return true;
  }
  // Silence a buffer deck from T: the gate ramps to 0 over the BUF_FADE_OUT before T (so a
  // kick ON the stop bar line never sounds) and the source stops at T.
  function stopBuffer(d, T) {
    const now = ctx.currentTime;
    const g = d.gate.gain;
    const fs = Math.max(now, T - BUF_FADE_OUT);
    const v = bufGateAt(d, fs);
    g.cancelScheduledValues(fs);
    g.setValueAtTime(v, fs);
    g.linearRampToValueAtTime(0, Math.max(T, fs + 1e-4));
    if (d.bufSrc) { try { d.bufSrc.stop(Math.max(T, d.bufPlan.startT)); } catch (e) { /* already ended */ } }
    d.gateHold = Math.max(T, fs + 1e-4);
    d.stopAt = Math.min(T, d.bufPlan.endT);
  }
  function bufferInfo(d) {
    const m = d.meta;
    const now = ctx.currentTime;
    const dur = d.buf.duration;
    const plan = d.bufPlan;
    const rate = plan ? plan.rate : Math.fround(bpm / m.bpm);
    // Buffer seconds under the playhead: the cue point before any play; while running the
    // grid map (valid for a late join too); frozen where a stop / the end left it.
    let bufPos = m.downbeatSec;
    if (plan) bufPos = plan.cue + (Math.min(now, d.stopAt != null ? d.stopAt : now) - plan.atT) * rate;
    const pos = Math.min(m.lengthBars, (bufPos - m.downbeatSec) / (4 * m.beatSec));
    const played = clamp(bufPos, 0, dur);
    return {
      loaded: true,
      playing: d.playing && !(d.stopAt != null && now >= d.stopAt),
      kind: 'buffer',
      name: d.info.name, artist: d.info.artist, key: d.info.key,
      bpm, trackBpm: m.bpm, rate,
      lengthBars: m.lengthBars,
      positionBars: pos,
      startsAtBar: d.startBar,
      elapsed: played / rate,                 // REAL seconds (at the audible rate) into the file
      remaining: (dur - played) / rate,       // REAL seconds until the deck stops by itself
      beatInBar: Math.max(0, Math.floor((pos - Math.floor(pos)) * 4)),
      playhead: m.lengthBars > 0 ? clamp(pos / m.lengthBars, 0, 1) : 0,
      trim: d.trim,
    };
  }

  // ---- public API ---------------------------------------------------------------------
  function load(deck, spec) {
    const d = decks[deck];
    if (!d) return false;
    if (d.playing) stop(deck);
    if (d.kind === 'buffer') Object.assign(d, { kind: 'synth', buf: null, meta: null, info: null, bufSrc: null, bufPlan: null });
    d.tr = buildTrack(spec);
    d.loaded = true;
    d.nextStep = 0;
    d.stopAt = null;
    d.echoSend.gain.value = d.tr.echo;
    d.verbSend.gain.value = d.tr.space;
    d.padLp.frequency.value = d.tr.harm.cutoff;
    d.hatBus.frequency.value = d.tr.hats.tone * 0.9;
    d.clapBus.frequency.value = d.tr.clap.tone;
    return true;
  }
  /**
   * Start `deck` so its track bar `fromBar` (default 0) lands on master bar `atBar`
   * (default: the next bar line). If that moment has already passed, the deck joins
   * mid-phrase, still beat- and bar-aligned — it never starts off the grid.
   */
  function play(deck, opts) {
    const d = decks[deck];
    if (!d || !d.loaded) return false;
    if (d.kind === 'buffer') return playBuffer(d, opts || {});
    const p = opts || {};
    const now = ctx.currentTime;
    if (d.playing) stop(deck);
    const fromBar = Math.max(0, Number(p.fromBar) || 0);
    const atBar = Number.isFinite(p.atBar) ? p.atBar : Math.ceil(barAt(now + MIN_LEAD * 2));
    d.startBar = atBar;
    d.startT = barTime(atBar) - fromBar * barDur;
    // First step to play: the cue point (track bar `fromBar`), or — if that moment has
    // passed — the first step still ahead of the clock, so the deck joins on the grid.
    const firstT = Math.max(barTime(atBar), now + MIN_LEAD);
    d.nextStep = Math.max(0, Math.ceil((firstT - d.startT) / stepDur - 1e-9));
    d.stopAt = null;
    d.playing = true;
    deckPlaying[deck] = true;
    const openT = Math.max(now, barTime(atBar) - 0.002);
    d.gate.gain.cancelScheduledValues(now);
    d.gate.gain.setValueAtTime(d.gate.gain.value, now);
    d.gate.gain.setValueAtTime(1, openT);
    d.pump.gain.cancelScheduledValues(now);
    d.pump.gain.setValueAtTime(1, now);
    scheduleDeck(d, now + lookahead);      // don't wait for the next tick
    return true;
  }
  /** Stop at master bar `atBar` (quantised), or now. */
  function stop(deck, opts) {
    const d = decks[deck];
    if (!d) return;
    const now = ctx.currentTime;
    const p = opts || {};
    const T = Number.isFinite(p.atBar) ? Math.max(now + MIN_LEAD, barTime(p.atBar)) : now + MIN_LEAD;
    if (d.kind === 'buffer') {
      if (d.bufPlan) stopBuffer(d, T);
    } else {
      d.stopAt = T;
      cutFrom(d, T);
      closeGate(d, T);
    }
    if (T <= now + MIN_LEAD) { d.playing = false; deckPlaying[deck] = false; }
  }
  function setParam(param, target, at, tau) {
    param.setTargetAtTime(target, Math.max(ctx.currentTime, at), tau);
  }
  /** fader 0..1, low/mid/hi −1..1 (−1 = kill). Omitted keys are left alone. */
  function setChannel(deck, vals, when) {
    const d = decks[deck];
    if (!d || !vals) return;
    const w = when || {};
    const at = Number.isFinite(w.at) ? w.at : ctx.currentTime;
    const tau = Number.isFinite(w.tau) ? w.tau : CTRL_TAU;
    const set = (k, param, target) => {
      if (vals[k] == null || !Number.isFinite(Number(vals[k]))) return;
      if (w.at == null && d.last[k] != null && Math.abs(d.last[k] - target) < 1e-4) return;
      d.last[k] = target;
      setParam(param, target, at, tau);
    };
    set('fader', d.fader.gain, faderGain(vals.fader));
    set('low', d.low.gain, eqDb(vals.low));
    set('mid', d.midEq.gain, eqDb(vals.mid));
    set('hi', d.high.gain, eqDb(vals.hi));
  }
  let lastXf = null;
  /** −1 = deck 0 (A) only … +1 = deck 1 (B) only; constant power. */
  function setXfader(v, when) {
    const x = (clamp(Number(v) || 0, -1, 1) + 1) / 2;
    const w = when || {};
    if (w.at == null && lastXf != null && Math.abs(lastXf - x) < 1e-4) return;
    lastXf = x;
    const at = Number.isFinite(w.at) ? w.at : ctx.currentTime;
    const tau = Number.isFinite(w.tau) ? w.tau : CTRL_TAU;
    setParam(decks[0].xf.gain, Math.cos(x * Math.PI / 2), at, tau);
    setParam(decks[1].xf.gain, Math.sin(x * Math.PI / 2), at, tau);
  }
  function trackInfo(deck) {
    const d = decks[deck];
    if (d && d.loaded && d.kind === 'buffer') return d.buf ? bufferInfo(d) : { loaded: false, playing: false };
    if (!d || !d.tr) return { loaded: false, playing: false };
    const now = ctx.currentTime;
    const len = d.tr.lengthBars;
    const started = d.playing || d.stopAt != null;
    // TRACK bar under the playhead (d.startT is the master time of track bar 0, so a
    // `fromBar` cue counts), frozen where a stop left it.
    const tt = d.stopAt != null ? Math.min(now, d.stopAt) : now;
    const pos = started ? clamp((tt - d.startT) / barDur, -1e9, len) : 0;
    return {
      loaded: true,
      playing: d.playing && !(d.stopAt != null && now >= d.stopAt),
      kind: 'synth',
      name: d.tr.name, artist: d.tr.artist, key: d.tr.key.label, bpm, trackBpm: bpm, rate: 1, seed: d.tr.seed,
      lengthBars: len,
      positionBars: pos,
      startsAtBar: d.startBar,
      elapsed: Math.max(0, pos) * barDur,
      remaining: Math.max(0, len - Math.max(0, pos)) * barDur,
      beatInBar: Math.max(0, Math.floor((pos - Math.floor(pos)) * 4)),
      playhead: clamp(pos / len, 0, 1),
    };
  }
  function dispose() {
    if (timer != null) clearInterval(timer);
    timer = null;
    if (visHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visHandler);
    for (const d of decks) {
      for (const s of d.sources) { try { s.src.stop(); } catch (e) { /* fine */ } try { s.src.disconnect(); } catch (e) { /* fine */ } }
      d.sources = [];
      if (d.bufSrc) { try { d.bufSrc.stop(); } catch (e) { /* fine */ } try { d.bufSrc.disconnect(); } catch (e) { /* fine */ } d.bufSrc = null; }
      d.buf = null;
      d.loaded = d.kind === 'buffer' ? false : d.loaded;
      d.playing = false;
      deckPlaying[d.idx] = false;
    }
    for (const n of owned) { try { n.disconnect(); } catch (e) { /* fine */ } }
    owned.length = 0;
  }

  return {
    ctx, bpm, t0, stats,
    beatDur, barDur,
    analyser, deckAnalysers, deckPlaying,
    load, loadBuffer, play, stop, setChannel, setXfader, trackInfo, pump, dispose, bufferLead: bufLead,
    deckKind: (deck) => (decks[deck] ? decks[deck].kind : null),
    barAt, barTime,
    get lookahead() { return lookahead; },
  };
}
