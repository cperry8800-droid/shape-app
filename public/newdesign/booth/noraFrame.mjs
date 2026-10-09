// noraFrame.mjs — when the booth draws a frame, and how wide its lens is in a portrait box. Pure:
// the caller passes the clock (rAF's timestamp, in ms) and the box; nothing here reads one.
//
// ⚠ PACING BY DIVIDING THE DISPLAY'S OWN RATE, NOT BY A TIME THRESHOLD. The stage this replaces
// drew when ≥ 1000/30 ms had passed since its last frame (noraStage.mjs:10). On a 60 Hz display
// rAF ticks every 16.7 ms, so a frame was due on the tick at 33.3 ms only when the tick landed at
// or after it: any jitter pushed it to the NEXT tick, 50 ms, and the booth ran at an uneven
// 20–25 fps that judders. Rendering every Nth vsync instead lands on an even divisor of the
// display (60 Hz → every 2nd tick, 120 Hz → every 4th) and never exceeds the target.

// The display's refresh, from rAF deltas. rAF is vsync-aligned, so the SHORTEST typical delta is
// one display period: a frame that took longer to draw shows up as a multiple of it, never as a
// fraction. The 20th percentile ignores the slow ones (and a stray short one) without averaging
// them in, which a median of a half-skipped stream would not.
export const MIN_SAMPLES = 8;
export function estimateHz(deltasMs) {
  const d = (deltasMs || []).filter((x) => Number.isFinite(x) && x > 2 && x < 100).sort((a, b) => a - b);
  if (d.length < MIN_SAMPLES) return null;
  const p = d[Math.floor((d.length - 1) * 0.2)];
  return 1000 / p;
}

// How many display frames per drawn frame: never above the target rate. The 0.1 of slack keeps a
// 60.2 Hz estimate (60.2 / 30 = 2.007) from rounding up to every THIRD tick.
export function dividerFor(displayHz, targetFps) {
  if (!(displayHz > 0) || !(targetFps > 0)) return 1;
  return Math.max(1, Math.ceil(displayHz / targetFps - 0.1));
}

/**
 * Call `tick(rafTimestampMs)` on every requestAnimationFrame; it answers whether to draw this
 * one and how much simulated time has passed since the last drawn frame.
 */
export function createFramePacer({ targetFps = 30, samples = 40 } = {}) {
  const deltas = [];
  let lastTick = null;
  let lastRender = null;
  let hz = null;
  // Until the display has been measured, assume the common 60 Hz rather than drawing every tick.
  let divider = dividerFor(60, targetFps);
  return {
    tick(now) {
      if (lastTick != null) {
        const d = now - lastTick;
        if (d > 2 && d < 100) { deltas.push(d); if (deltas.length > samples) deltas.shift(); }
      }
      lastTick = now;
      const est = estimateHz(deltas);
      if (est) { hz = est; divider = dividerFor(hz, targetFps); }
      const period = 1000 / (hz || 60);
      // Half a period of slack either side: a late tick still draws, and a tick dropped by the
      // compositor makes the next one due rather than costing a whole extra period.
      if (lastRender == null || now - lastRender >= (divider - 0.5) * period) {
        const dt = lastRender == null ? 0 : (now - lastRender) / 1000;
        lastRender = now;
        return { render: true, dt };
      }
      return { render: false, dt: 0 };
    },
    // After a pause (a hidden tab, a detached booth) the gap is not a frame: forget it, keep the
    // refresh estimate.
    reset() { lastTick = null; lastRender = null; },
    get hz() { return hz; },
    get divider() { return divider; },
    get targetFps() { return targetFps; },
  };
}

// ── Framing ──────────────────────────────────────────────────────────────────
// The director's shots were framed on a 16:9 page. PerspectiveCamera.fov is VERTICAL, so the same
// fov in a portrait box keeps the height and loses the sides: on a 4:5 phone box a shot across
// both decks cut Nora's hands off at the wrists. This widens the vertical lens just enough to keep
// `keep` of the 16:9 shot's horizontal coverage, and never narrows it.
export const REF_ASPECT = 16 / 9;
export function fitFov(fovDeg, aspect, { ref = REF_ASPECT, keep = 0.72, max = 72 } = {}) {
  if (!Number.isFinite(fovDeg) || !(aspect > 0) || aspect >= ref) return fovDeg;
  const halfW = Math.tan((fovDeg * Math.PI) / 360) * ref * keep;   // half-width at unit depth
  const need = (Math.atan(halfW / aspect) * 360) / Math.PI;
  return Math.min(Math.max(fovDeg, max), Math.max(fovDeg, need));
}
