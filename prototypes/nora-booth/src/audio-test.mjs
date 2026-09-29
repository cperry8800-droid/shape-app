// audio-test.mjs — verifies deckAudio.mjs on REAL rendered audio (OfflineAudioContext).
//  A. 16 bars of deck 0 → tempo from Shape Radio's shipped detector, band RMS/peak, spectrogram
//  B. bars 20–36 of the same track → the breakdown (28–31) and the drop
//  C. a 2-deck blend with fader / EQ automation → master headroom, raw and through the clipper
//  D. all six demo tracks, 4 bars each → are they clearly different?
//  E. trackWaveform() against the measured per-16th band energy
//  F. the realtime scheduler on a live AudioContext, with a blocked main thread
import { createDeckAudio, trackWaveform, describeTrack, DEMO_TRACKS } from './deckAudio.mjs';
import { createTempoDetector, tempoEnergyFromBins } from '/home/user/shape-app/public/newdesign/radioTempo.mjs';

const SR = 44100;
const BPM = 124;
const BAR = 240 / BPM;
const T0 = 0.05;
const report = {};
const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h; document.body.appendChild(d); return d; };

// ---------- DSP helpers ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
function mono(buf) {
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const m = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) m[i] = 0.5 * (a[i] + b[i]);
  return m;
}
function peakOf(buf) {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c += 1) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 1) { const v = Math.abs(d[i]); if (v > p) p = v; } }
  return p;
}
function countAbove(buf, th) {
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c += 1) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 1) if (Math.abs(d[i]) > th) n += 1; }
  return n;
}
// STFT: frames of power spectra + band mean-squares per frame (Parseval, Hann window).
function stft(x, N = 2048, hop = 512) {
  const w = new Float32Array(N); let w2 = 0;
  for (let i = 0; i < N; i += 1) { w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); w2 += w[i] * w[i]; }
  const frames = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  const binHz = SR / N;
  for (let s = 0; s + N <= x.length; s += hop) {
    for (let i = 0; i < N; i += 1) { re[i] = x[s + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const p = new Float32Array(N / 2);
    let lo = 0, mi = 0, hi = 0;
    for (let k = 1; k < N / 2; k += 1) {
      const pw = re[k] * re[k] + im[k] * im[k];
      p[k] = pw;
      const f = k * binHz;
      const ms = 2 * pw / (N * w2);
      if (f < 200) lo += ms; else if (f < 5000) mi += ms; else hi += ms;
    }
    frames.push({ t: (s + N / 2) / SR, p, lo, mi, hi });
  }
  return { frames, N, hop, w2 };
}
const db = (ms) => (ms > 0 ? 10 * Math.log10(ms) : -200);
function bandStats(S) {
  let lo = 0, mi = 0, hi = 0;
  for (const f of S.frames) { lo += f.lo; mi += f.mi; hi += f.hi; }
  const n = S.frames.length || 1;
  return { lowRmsDb: +db(lo / n).toFixed(1), midRmsDb: +db(mi / n).toFixed(1), highRmsDb: +db(hi / n).toFixed(1) };
}
// Per-16th band RMS (for comparison with trackWaveform), from STFT frames.
function per16(S, startT, steps) {
  const step = BAR / 16;
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const a = startT + i * step, b = a + step;
    let lo = 0, mi = 0, hi = 0, n = 0;
    for (const f of S.frames) if (f.t >= a && f.t < b) { lo += f.lo; mi += f.mi; hi += f.hi; n += 1; }
    n = n || 1;
    out.push({ low: Math.sqrt(lo / n), mid: Math.sqrt(mi / n), high: Math.sqrt(hi / n) });
  }
  return out;
}
function pearson(a, b) {
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i += 1) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i += 1) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb || 1);
}
// Magma-ish colormap
const CMAP = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
function cmap(v) {
  const x = Math.max(0, Math.min(1, v)) * (CMAP.length - 1);
  const i = Math.min(CMAP.length - 2, Math.floor(x)), f = x - i;
  return CMAP[i].map((c, k) => Math.round(c + (CMAP[i + 1][k] - c) * f));
}
function drawSpectrogram(S, title, opts = {}) {
  const W = opts.w || 1200, H = opts.h || 220;
  const box = $(`<div class="lbl">${title}</div>`);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H + 16; box.appendChild(cv);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const fmin = 30, fmax = 16000, binHz = SR / S.N;
  const nF = S.frames.length;
  for (let x = 0; x < W; x += 1) {
    const f0 = Math.floor(x * nF / W), f1 = Math.max(f0 + 1, Math.floor((x + 1) * nF / W));
    for (let y = 0; y < H; y += 1) {
      const fa = fmin * Math.pow(fmax / fmin, 1 - (y + 1) / H), fb = fmin * Math.pow(fmax / fmin, 1 - y / H);
      const ka = Math.max(1, Math.floor(fa / binHz)), kb = Math.max(ka + 1, Math.ceil(fb / binHz));
      let m = 0;
      for (let fi = f0; fi < f1 && fi < nF; fi += 1) { const p = S.frames[fi].p; for (let k = ka; k < kb && k < p.length; k += 1) if (p[k] > m) m = p[k]; }
      const d = 10 * Math.log10(2 * m / (S.N * S.w2) + 1e-20);
      const c = cmap((d + 95) / 85);
      const o = (y * W + x) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#111'; g.fillRect(0, H, W, 16);
  g.font = '10px monospace'; g.fillStyle = '#9ab';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = H * (1 - Math.log(f / fmin) / Math.log(fmax / fmin));
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y, 6, 1); g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 8, y + 3);
  }
  if (opts.bars) {
    const dur = S.frames[nF - 1].t;
    for (let b = 0; b <= opts.bars; b += 1) {
      const x = ((T0 + b * BAR) / dur) * W;
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, H, 1, 16);
      g.fillStyle = '#9ab'; g.fillText(String((opts.barOffset || 0) + b), x + 2, H + 12);
    }
  }
  return cv;
}
function drawWaveRows(title, rows) {
  const W = 1200, RH = 46;
  const box = $(`<div class="lbl">${title}</div>`);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = RH * rows.length; box.appendChild(cv);
  const g = cv.getContext('2d');
  g.fillStyle = '#0b0d10'; g.fillRect(0, 0, W, cv.height);
  rows.forEach(([name, arr], r) => {
    const y0 = r * RH, n = arr.length, bw = W / n;
    for (let i = 0; i < n; i += 1) {
      const v = arr[i]; const x = i * bw; const mid = y0 + RH / 2;
      const hl = v.low * (RH / 2 - 2), hm = v.mid * (RH / 2 - 2) * 0.8, hh = v.high * (RH / 2 - 2) * 0.55;
      g.fillStyle = '#1f4fbf'; g.fillRect(x, mid - hl, Math.max(1, bw - 0.5), hl * 2);
      g.fillStyle = '#f0a030'; g.fillRect(x, mid - hm, Math.max(1, bw - 0.5), hm * 2);
      g.fillStyle = '#f4f4f4'; g.fillRect(x, mid - hh, Math.max(1, bw - 0.5), hh * 2);
    }
    g.fillStyle = '#9ab'; g.font = '10px monospace'; g.fillText(name, 4, y0 + 11);
  });
}

// ---------- offline render with analyser taps ----------
async function renderOffline({ seconds, setup, tapHz = 60, onTap }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const eng = createDeckAudio({ ctx, bpm: BPM, t0: T0, ...(setup.engineOpts || {}) });
  eng.load(0, setup.deck0 || DEMO_TRACKS[0]);
  eng.load(1, setup.deck1 || DEMO_TRACKS[1]);
  setup.run(eng, ctx);
  eng.pump(seconds);
  if (onTap) {
    const bins = new Uint8Array(eng.analyser.frequencyBinCount);
    const n = Math.floor((seconds - 0.05) * tapHz);
    for (let i = 1; i <= n; i += 1) {
      const t = i / tapHz;
      ctx.suspend(t).then(() => { eng.analyser.getByteFrequencyData(bins); onTap(t, bins, eng); ctx.resume(); });
    }
  }
  const buf = await ctx.startRendering();
  const stats = { ...eng.stats };
  eng.dispose();
  return { buf, stats };
}
function tempoTap() {
  const det = createTempoDetector();
  const log = { first: null, last: null, readings: 0, nulls: 0, values: new Map(), series: [] };
  return {
    log,
    tap(t, bins) {
      const e = tempoEnergyFromBins(bins);
      if (e != null) det.push(t, e);
      const r = det.read(t);
      if (r) {
        log.readings += 1; log.last = { t: +t.toFixed(2), bpm: r.bpm, score: +r.score.toFixed(3) };
        if (!log.first) log.first = { t: +t.toFixed(2), bpm: r.bpm };
        log.values.set(r.bpm, (log.values.get(r.bpm) || 0) + 1);
      } else log.nulls += 1;
      if (Math.abs(t * 2 - Math.round(t * 2)) < 1e-6) log.series.push([+t.toFixed(1), r ? r.bpm : null]);
    },
  };
}
const summarizeTempo = (lg) => ({
  firstReading: lg.first, finalReading: lg.last,
  distinctBpms: [...lg.values.entries()].map(([b, n]) => `${b}×${n}`).join(' '),
  nullFrames: lg.nulls, readingFrames: lg.readings,
});

async function main() {
  $('<h1>deckAudio — offline verification</h1><pre id="rep">running…</pre>');
  const spec = DEMO_TRACKS[0];
  report.tracks = DEMO_TRACKS.map((s) => describeTrack(s));

  // ---------- A. 16 bars of deck 0 ----------
  const secA = T0 + 16 * BAR + 0.6;
  const tA = tempoTap();
  const A = await renderOffline({
    seconds: secA,
    setup: { engineOpts: { safetyClip: false }, run: (e) => { e.setChannel(0, { fader: 1, low: 0, mid: 0, hi: 0 }, { at: 0 }); e.setXfader(-1, { at: 0 }); e.play(0, { atBar: 0 }); } },
    onTap: tA.tap,
  });
  const SA = stft(mono(A.buf));
  report.A_16bars = {
    track: `${spec.name} — ${spec.artist} (${spec.key})`,
    tempo: summarizeTempo(tA.log),
    peak: +peakOf(A.buf).toFixed(4),
    samplesOver0_8: countAbove(A.buf, 0.8),
    ...bandStats(SA), stats: A.stats,
  };
  const arA = describeTrack(spec).arrangement;
  drawSpectrogram(SA, `A · ${spec.name} bars 0–16 (deck 0 solo, fader 1, EQ flat, no safety clip) — kick+hats · clap @${arA.clapIn} · bass @${arA.bassIn} · harmony @${arA.harmIn} · perc @${arA.percIn}`, { bars: 16 });

  // ---------- E. waveform model vs measured ----------
  const meas = per16(SA, T0, 256);
  const model = trackWaveform(spec, 16);
  const corr = {};
  for (const k of ['low', 'mid', 'high']) corr[k] = +pearson(model.map((m) => m[k]), meas.map((m) => m[k])).toFixed(3);
  report.E_waveformVsMeasured = corr;
  const nl = (arr, k) => { let m = 0; for (const x of arr) m = Math.max(m, x[k]); return arr.map((x) => x[k] / m); };
  const mL = nl(model, 'low'), sL = nl(meas, 'low');
  const meanOf = (arr, a, b) => +(arr.slice(a, b).reduce((x, y) => x + y, 0) / (b - a)).toFixed(3);
  report.E_bandMeans = {};
  for (const k of ['low', 'mid', 'high']) {
    const mm = nl(model, k).map((v, i) => model[i][k]), ms = nl(meas, k);
    report.E_bandMeans[k] = { model_0_8: meanOf(model.map((x) => x[k]), 0, 128), meas_0_8: meanOf(ms, 0, 128), model_8_16: meanOf(model.map((x) => x[k]), 128, 256), meas_8_16: meanOf(ms, 128, 256) };
  }
  report.E_sampleLowBar9 = { model: mL.slice(144, 160).map((v) => +v.toFixed(2)).join(' '), measured: sL.slice(144, 160).map((v) => +v.toFixed(2)).join(' ') };
  report.E_sampleLowBar1 = { model: mL.slice(16, 32).map((v) => +v.toFixed(2)).join(' '), measured: sL.slice(16, 32).map((v) => +v.toFixed(2)).join(' ') };
  const mx = { low: 0, mid: 0, high: 0 };
  for (const m of meas) for (const k in mx) mx[k] = Math.max(mx[k], m[k]);
  drawWaveRows('E · trackWaveform() model (top) vs measured per-16th band RMS (bottom, normalised)', [
    ['model', model], ['measured', meas.map((m) => ({ low: m.low / mx.low, mid: m.mid / mx.mid, high: m.high / mx.high }))],
  ]);

  // ---------- B. breakdown + drop ----------
  const secB = T0 + 16 * BAR + 0.6;
  const tB = tempoTap();
  const B = await renderOffline({
    seconds: secB,
    setup: { engineOpts: { safetyClip: false }, run: (e) => { e.setXfader(-1, { at: 0 }); e.play(0, { atBar: 0, fromBar: 20 }); } },
    onTap: tB.tap,
  });
  const SB = stft(mono(B.buf));
  report.B_breakdown = { tempo: summarizeTempo(tB.log), tempoSeries: tB.log.series.filter((_, i) => i % 2 === 0).map(([t, b]) => `${t}:${b ?? '—'}`).join(' '), peak: +peakOf(B.buf).toFixed(4), ...bandStats(SB) };
  drawSpectrogram(SB, 'B · same track, track bars 20–36: breakdown bars 28–31 (kick+bass out, pad swell, riser) → drop + crash at 32', { bars: 16, barOffset: 20 });

  // ---------- C. two-deck blend ----------
  const trB = DEMO_TRACKS[1];
  const blendSetup = (e) => {
    const at = (bar) => T0 + bar * BAR;
    e.setXfader(0, { at: 0 });
    e.setChannel(0, { fader: 1, low: 0, mid: 0, hi: 0 }, { at: 0 });
    e.setChannel(1, { fader: 0, low: -1, mid: 0, hi: 0 }, { at: 0 });
    e.play(0, { atBar: 0, fromBar: 40 });
    e.play(1, { atBar: 0 });
    for (let b = 1; b <= 4; b += 1) e.setChannel(1, { fader: b / 4 }, { at: at(b), tau: 0.4 });
    // STRESS (bars 6–8): both decks full, both lows flat, deck B low +6 dB, deck B hi +6 dB.
    e.setChannel(1, { low: 1, hi: 1 }, { at: at(6), tau: 0.05 });
    e.setChannel(0, { low: -1 }, { at: at(8), tau: 0.02 });   // the bass swap
    e.setChannel(1, { low: 0, hi: 0 }, { at: at(8), tau: 0.02 });
    e.setChannel(0, { hi: -0.6, mid: -0.3 }, { at: at(10), tau: 0.3 });
    e.setXfader(0.6, { at: at(12), tau: 0.5 });
    for (let b = 12; b <= 15; b += 1) e.setChannel(0, { fader: 1 - (b - 11) / 4 }, { at: at(b), tau: 0.3 });
    e.stop(0, { atBar: 16 });
  };
  const secC = T0 + 17 * BAR;
  const tC = tempoTap();
  const Craw = await renderOffline({ seconds: secC, setup: { engineOpts: { safetyClip: false }, run: blendSetup }, onTap: tC.tap });
  const Cclip = await renderOffline({ seconds: secC, setup: { run: blendSetup } });
  const SC = stft(mono(Cclip.buf));
  // Peak in the ordinary part of the mix (outside the deliberate +6 dB stress window)
  const d0 = Craw.buf.getChannelData(0), d1 = Craw.buf.getChannelData(1);
  let pOrd = 0, pStress = 0;
  const s6 = Math.floor((T0 + 6 * BAR) * SR), s8 = Math.floor((T0 + 8.1 * BAR) * SR);
  for (let i = 0; i < d0.length; i += 1) { const v = Math.max(Math.abs(d0[i]), Math.abs(d1[i])); if (i >= s6 && i < s8) pStress = Math.max(pStress, v); else pOrd = Math.max(pOrd, v); }
  report.C_blend = {
    decks: `${spec.name} (from bar 40) × ${trB.name}`,
    rawPeakOrdinaryMix: +pOrd.toFixed(4),
    rawPeakStressWindow_plus6dB: +pStress.toFixed(4),
    rawSamplesOver0_8: countAbove(Craw.buf, 0.8),
    masterPeakWithSafetyClip: +peakOf(Cclip.buf).toFixed(4),
    tempo: summarizeTempo(tC.log),
    ...bandStats(SC),
  };
  drawSpectrogram(SC, `C · blend: ${spec.name} (deck A, bar 40+) → ${trB.name} (deck B): B fader up 1–4, STRESS +6 dB low/hi 6–8, bass swap @8, A hi/mid cut @10, xfader →B @12, A fader down 12–16, A stop @16`, { bars: 16 });

  // ---------- D. the six tracks ----------
  report.D_sixTracks = [];
  const strip = [];
  for (let i = 0; i < DEMO_TRACKS.length; i += 1) {
    const sp = DEMO_TRACKS[i];
    const R = await renderOffline({ seconds: T0 + 4 * BAR + 0.3, setup: { deck0: sp, engineOpts: { safetyClip: false }, run: (e) => { e.setXfader(-1, { at: 0 }); e.play(0, { atBar: 0, fromBar: 8 }); } } });
    const S = stft(mono(R.buf));
    let num = 0, den = 0;
    for (const f of S.frames) for (let k = 1; k < f.p.length; k += 1) { num += k * f.p[k]; den += f.p[k]; }
    const centroid = (num / den) * SR / S.N;
    report.D_sixTracks.push({ name: sp.name, key: sp.key, peak: +peakOf(R.buf).toFixed(3), centroidHz: Math.round(centroid), ...bandStats(S) });
    strip.push([S, sp]);
  }
  for (const [S, sp] of strip) {
    const d = describeTrack(sp);
    drawSpectrogram(S, `D · ${sp.name} — ${sp.artist} · ${d.keyName} · ${d.progression} (${d.harmony}) · bass ${d.bassRhythm} · hats ${d.hatGroove} · ${d.clap} · kick ${d.kickHz} Hz · swing ${d.swing}`, { h: 110, w: 1200, bars: 4, barOffset: 8 });
  }
  drawWaveRows('trackWaveform() overviews, 128 bars each (the deck screens\' overview)', DEMO_TRACKS.map((s) => [s.name, trackWaveform(s)]));

  // ---------- F. realtime scheduler ----------
  try {
    const actx = new AudioContext();
    if (actx.state !== 'running') await actx.resume();
    const eng = createDeckAudio({ ctx: actx, bpm: BPM });
    eng.load(0, DEMO_TRACKS[0]); eng.load(1, DEMO_TRACKS[1]);
    eng.setXfader(0);
    eng.play(0, { atBar: 0 });
    const bins = new Uint8Array(eng.analyser.frequencyBinCount);
    await new Promise((r) => setTimeout(r, 1200));
    const t = actx.currentTime;
    const bSpin = performance.now(); while (performance.now() - bSpin < 450) { /* block the main thread like a janky frame */ }
    await new Promise((r) => setTimeout(r, 600));
    eng.analyser.getByteFrequencyData(bins);
    let sum = 0; for (const v of bins) sum += v;
    eng.play(1, { atBar: Math.ceil(eng.barAt(actx.currentTime)) });
    await new Promise((r) => setTimeout(r, 400));
    const playingBoth = eng.deckPlaying.slice();
    eng.stop(0);
    await new Promise((r) => setTimeout(r, 100));
    report.F_realtime = {
      state: actx.state, ctxTimeAdvanced: +(actx.currentTime - t).toFixed(3),
      masterAnalyserSum: sum, playingBoth, afterStop: eng.deckPlaying.slice(),
      info0: eng.trackInfo(0), stats: { ...eng.stats }, lookaheadAfterBlock: +eng.lookahead.toFixed(3),
    };
    eng.dispose();
    await actx.close();
  } catch (err) { report.F_realtime = { error: String(err) }; }

  const compact = (v) => JSON.stringify(v);
  document.getElementById('rep').textContent = Object.entries(report).map(([k, v]) => Array.isArray(v) ? `${k}:\n  ${v.map(compact).join('\n  ')}` : `${k}: ${compact(v)}`).join('\n');
  window.__report = report;
  window.__done = true;
}
main().catch((e) => { window.__report = { error: String(e && e.stack || e) }; window.__done = true; });
