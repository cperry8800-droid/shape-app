// trackAnalysis-real.mjs — the REAL-SIGNAL check: deckAudio's synthesized DEMO_TRACKS[0]
// (known 124 BPM, known t0) rendered through an OfflineAudioContext exactly as the booth plays
// it, then measured by analyzeTrack IN THE BROWSER. The kick here is deckAudio's own voice (a
// sine with a 3.x→1.35→1× pitch sweep, a 2.5 ms linear attack, a noise click, through a soft
// clipper) — not the test suite's fixture kick — so it checks the analyser against a signal it
// was not tuned on.
import { createDeckAudio, DEMO_TRACKS, describeTrack } from '../../../public/newdesign/booth/deckAudio.mjs';
import { analyzeTrack, bufferWaveform } from '../../../public/newdesign/booth/trackAnalysis.mjs';

const SR = 44100, BPM = 124, BAR = 240 / BPM, T0 = 0.0437;   // t0 deliberately not round

async function render(bars) {
  const secs = T0 + bars * BAR + 0.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(secs * SR), SR);
  const eng = createDeckAudio({ ctx, bpm: BPM, t0: T0 });
  eng.load(0, DEMO_TRACKS[0]);
  eng.setXfader(-1, { at: 0 });
  eng.setChannel(0, { fader: 1, low: 0, mid: 0, hi: 0 }, { at: 0 });
  eng.play(0, { atBar: 0 });
  eng.pump(secs);
  const buf = await ctx.startRendering();
  const stats = { ...eng.stats };
  eng.dispose();
  return { buf, stats };
}
const fresh = (buf, n) => [0, 1].map((c) => buf.getChannelData(c).slice(0, n));   // new arrays: no cache
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

let rendered = null;
async function prepare() {
  const tR = performance.now();
  rendered = await render(64);
  return { renderMs: Math.round(performance.now() - tR), seconds: +rendered.buf.duration.toFixed(3), stats: rendered.stats };
}
// Timed analysis runs, callable from the runner (so it can throttle the CPU around them).
function analyze(runs = 5) {
  const buf = rendered.buf;
  const n60 = Math.floor(60 * SR);
  const tFull = [], t60 = [], tWave = [];
  let meta = null, meta60 = null;
  for (let r = 0; r < runs; r++) {
    let ch = fresh(buf, buf.length);
    let a = performance.now(); meta = analyzeTrack(ch, SR); tFull.push(performance.now() - a);
    a = performance.now(); bufferWaveform(ch, SR, meta); tWave.push(performance.now() - a);   // cached bands
    ch = fresh(buf, n60);
    a = performance.now(); meta60 = analyzeTrack(ch, SR); t60.push(performance.now() - a);
  }
  const chW = fresh(buf, n60);
  const aW = performance.now(); bufferWaveform(chW, SR, meta60); const waveCold = performance.now() - aW;
  const wf = bufferWaveform(fresh(buf, buf.length), SR, meta);
  // low band peaks on beats: in kicked bars, the loudest 16th of each beat is its first
  let onBeat = 0, beats = 0;
  for (let b = 0; b < meta.lengthBars; b++) {
    if (meta.kickByBar[b] < 0.4) continue;
    for (let q = 0; q < 4; q++) {
      const i = (b * 4 + q) * 4, sl = wf.slice(i, i + 4).map((x) => x.low);
      beats++; if (sl.indexOf(Math.max(...sl)) === 0) onBeat++;
    }
  }
  const pick = (m) => ({
    bpm: m.bpm, bpmPrecise: m.bpmPrecise, bpmErr: +(m.bpmPrecise - BPM).toFixed(4),
    downbeatSec: m.downbeatSec, downbeatErrMs: +((m.downbeatSec - T0) * 1000).toFixed(3),
    firstKickBar: m.firstKickBar, lengthBars: m.lengthBars, breakdowns: m.breakdowns, outroBar: m.outroBar,
    mixOutBar: m.mixOutBar, mixInFromBar: m.mixInFromBar, mixOutFits: m.mixOutFits, confidence: m.confidence,
    residualMs: m.residualMs, halvesBpm: m.halvesBpm, beatsFit: m.beatsFit, reason: m.reason,
    kickByBar: m.kickByBar.map((v) => v.toFixed(2)).join(' '),
  });
  return {
    full: { seconds: +(buf.length / SR).toFixed(2), ...pick(meta), analyzeMsMedian: +med(tFull).toFixed(1), analyzeMsAll: tFull.map((x) => +x.toFixed(1)) },
    sixty: { seconds: 60, ...pick(meta60), analyzeMsMedian: +med(t60).toFixed(1), analyzeMsAll: t60.map((x) => +x.toFixed(1)) },
    waveform: { length: wf.length, expected: meta.lengthBars * 16, lowPeakOnBeatFrac: +(onBeat / beats).toFixed(3), msCachedMedian: +med(tWave).toFixed(2), msCold60s: +waveCold.toFixed(1) },
  };
}
window.__prepare = prepare;
window.__analyze = analyze;
window.__track = describeTrack(DEMO_TRACKS[0]);
window.__ready = true;
