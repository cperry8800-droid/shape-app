// Stand-in audio for station-mode testing ONLY (never published): 60 s house-like loops at known tempos.
const fs = require('fs');
const SR = 44100, DUR = 60;
const files = [['hf_20260903_164640_5a06417b-ce80-4651-a5c1-1dc026ddbe9b.m4a',121.5,0.21],['hf_20260903_164640_1eb7850f-c97e-4e56-8cbc-c250be32e92b.m4a',123.8,0.05],['hf_20260903_164640_d3535005-a4f4-4b01-b3a3-6b575e193c59.m4a',119.6,0.4],['hf_20260903_164640_26a60d67-53cd-4b17-a0d4-261be0f9488e.m4a',125.9,0.12]];
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
for (const [name, bpm, off] of files) {
  const N = SR * DUR, x = new Float32Array(N), beat = 60 / bpm, bars = Math.floor((DUR - off) / (4 * beat));
  const introBars = 4, outroStart = bars - 6;
  for (let b = 0; b < bars; b++) for (let q = 0; q < 4; q++) {
    const t0 = off + (b * 4 + q) * beat, i0 = Math.round(t0 * SR);
    const kick = b >= introBars && b < outroStart + 4;
    const fade = b >= outroStart ? Math.max(0, 1 - (b - outroStart) / 6) : 1;
    for (let i = 0; i < Math.round(beat * SR) && i0 + i < N; i++) {
      const t = i / SR; let v = 0;
      if (kick) v += 0.8 * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9);
      const th = t - beat / 2; if (th >= 0) v += 0.12 * (rnd() * 2 - 1) * Math.exp(-th * 60);   // off-beat hat
      const chord = [220, 277.2, 329.6][b % 3 === 2 ? 1 : 0];
      v += 0.08 * Math.sin(2 * Math.PI * chord * (t0 + t)) + 0.05 * Math.sin(2 * Math.PI * chord * 1.5 * (t0 + t));
      x[i0 + i] += v * fade;
    }
  }
  const buf = Buffer.alloc(44 + N * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 26000))), 44 + i * 2);
  fs.writeFileSync('fixture-site/tracks/' + name, buf); console.log(name, bpm, bars, 'bars');
}
