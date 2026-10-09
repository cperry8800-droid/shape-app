import { createDeckAudio, DEMO_TRACKS } from '../../../public/newdesign/booth/deckAudio.mjs';
import { createTempoDetector, tempoEnergyFromBins, tempoOnsets } from '../../../public/newdesign/radioTempo.mjs';
const SR = 44100, BPM = 124, BAR = 240 / BPM, BEAT = 60 / BPM, T0 = 0.05;
async function run(spec, fromBar, mute, bars = 16) {
  const secs = T0 + bars * BAR + 0.3;
  const ctx = new OfflineAudioContext(2, Math.ceil(secs * SR), SR);
  const e = createDeckAudio({ ctx, bpm: BPM, t0: T0, safetyClip: false, _mute: mute });
  e.load(0, spec); e.setXfader(-1, { at: 0 }); e.play(0, { atBar: 0, fromBar }); e.pump(secs);
  const det = createTempoDetector(); const bins = new Uint8Array(256); const samples = []; let read = 0, first = null, last = null;
  for (let i = 1; i <= Math.floor((secs - 0.05) * 60); i += 1) { const t = i / 60; ctx.suspend(t).then(() => { e.analyser.getByteFrequencyData(bins); const en = tempoEnergyFromBins(bins); if (en != null) { det.push(t, en); samples.push({ t, e: en }); } const r = det.read(t); if (r) { read++; if (!first) first = t; last = r.bpm; } ctx.resume(); }); }
  await ctx.startRendering();
  const on = tempoOnsets(samples); const hist = new Array(8).fill(0); let tot = 0;
  for (const o of on) { const ph = ((((o.t - T0) / BEAT) % 1) + 1) % 1; hist[Math.floor(ph * 8)] += o.d; tot += o.d; }
  return { mute: mute.join('+') || 'full', readFrac: +(read / (samples.length || 1)).toFixed(2), first: first && +first.toFixed(1), last, phaseHist8: hist.map((h) => +(h / tot).toFixed(2)).join(' ') };
}
(async () => {
  const out = [];
  for (let si = 0; si < DEMO_TRACKS.length; si += 1) {
    const sp = DEMO_TRACKS[si];
    for (const m of (si < 1 ? [[], ['pad', 'stab'], ['bass']] : [[]])) out.push({ track: sp.name, ...(await run(sp, 8, m)) });
  }
  window.__report = out; window.__done = true;
})().catch((err) => { window.__report = String(err.stack || err); window.__done = true; });
