// Pure audio-reactive driver for the Nora avatar. Imported by noraStage.mjs (the render
// loop) AND tests/nora-reactive.test.mjs. No DOM / Three / Web-Audio here — just math,
// so it is fully unit-testable. The render loop smooths toward these target params.

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Split an AnalyserNode byte-frequency array (0..255 per bin) into low/mid/high band
// energies + an overall level, each normalized to 0..1.
export function computeBands(freq) {
  const n = freq ? freq.length : 0;
  if (!n) return { low: 0, mid: 0, high: 0, level: 0 };
  const lowEnd = Math.floor(n * 0.10);
  const midEnd = Math.floor(n * 0.40);
  let ls = 0, ms = 0, hs = 0, all = 0;
  for (let i = 0; i < n; i++) {
    const v = freq[i] / 255;
    all += v;
    if (i < lowEnd) ls += v;
    else if (i < midEnd) ms += v;
    else hs += v;
  }
  const lowN = lowEnd || 1, midN = (midEnd - lowEnd) || 1, highN = (n - midEnd) || 1;
  return { low: ls / lowN, mid: ms / midN, high: hs / highN, level: all / n };
}

// Map bands + a time (ms) to bounded rig parameter TARGETS. tMs drives idle motion (sway,
// blink) so Nora still feels alive in near-silence.
export function computeRigParams(bands, tMs) {
  const { low = 0, mid = 0, high = 0, level = 0 } = bands || {};
  const t = (tMs || 0) / 1000;
  const sway = Math.sin(t * 1.2);
  const bob = Math.sin(t * 2.0);
  const blink = ((tMs || 0) % 4000) < 120 ? 1 : 0;   // ~120ms blink every 4s
  return {
    headBob: clamp(low * 0.6 + bob * 0.05, -0.5, 0.5),     // head pitch (rad-ish target)
    spineSway: clamp(sway * 0.08 + mid * 0.15, -0.4, 0.4), // spine roll
    armRaise: clamp(mid * 0.7 + high * 0.3, 0, 1),         // 0..1 arms/hands up
    handBounce: clamp(high * 0.8 + low * 0.2, 0, 1),
    expression: clamp(level * 1.2, 0, 1),                  // joy intensity 0..1
    blink,
  };
}
