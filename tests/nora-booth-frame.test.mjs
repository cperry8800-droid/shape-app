// When the booth draws, and how wide its lens is in a portrait box
// (public/newdesign/booth/noraFrame.mjs). The pacer replaces a ≥33.3 ms threshold that landed at
// 20–25 fps with judder on a 60 Hz display; these drive it with rAF timestamps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateHz, dividerFor, createFramePacer, fitFov, REF_ASPECT, MIN_SAMPLES } from '../public/newdesign/booth/noraFrame.mjs';

// A run of rAF ticks at `hz`, with optional jitter (ms) and dropped ticks.
function ticks(hz, n, { jitter = 0, drop = () => false, t0 = 1000 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (drop(i)) continue;
    out.push(t0 + (i * 1000) / hz + (jitter ? ((i * 7919) % 11) / 10 * jitter - jitter / 2 : 0));
  }
  return out;
}
// The steady-state rate: the first `warm` ticks run (so the pacer measures the display) but are
// not counted, because the first few frames are drawn before the refresh has been measured.
function run(pacer, ts, warm = MIN_SAMPLES * 3) {
  let drawn = 0, first = null, last = null;
  ts.forEach((t, i) => { if (pacer.tick(t).render && i >= warm) { drawn++; if (first == null) first = t; last = t; } });
  return { drawn, fps: last > first ? ((drawn - 1) * 1000) / (last - first) : 0 };
}

test('the display rate is the shortest typical frame, not the average', () => {
  assert.equal(estimateHz([16.7, 16.7]), null, 'too few samples to say');
  assert.ok(Math.abs(estimateHz(Array(20).fill(1000 / 60)) - 60) < 0.01);
  // Half the frames took two periods to draw: the display is still 60 Hz.
  const mixed = Array.from({ length: 40 }, (_, i) => (i % 2 ? 1000 / 30 : 1000 / 60));
  assert.ok(Math.abs(estimateHz(mixed) - 60) < 0.01, `read ${estimateHz(mixed)}`);
  // Out-of-range gaps (a stall, a hidden tab) are not frames.
  assert.ok(Math.abs(estimateHz([...Array(MIN_SAMPLES).fill(1000 / 120), 500, 0, -4, NaN]) - 120) < 0.01);
});

test('the divider lands on an even fraction of the display and never above the target', () => {
  assert.equal(dividerFor(60, 30), 2);
  assert.equal(dividerFor(60.2, 30), 2, 'a 60.2 Hz estimate rounded up to every third tick');
  assert.equal(dividerFor(59.8, 30), 2);
  assert.equal(dividerFor(120, 30), 4);
  assert.equal(dividerFor(90, 30), 3);
  assert.equal(dividerFor(75, 30), 3, '75 / 2 = 37.5 fps would exceed the target');
  assert.equal(dividerFor(144, 30), 5);
  assert.equal(dividerFor(60, 60), 1);
  assert.equal(dividerFor(120, 60), 2);
  assert.equal(dividerFor(30, 60), 1, 'a slow display draws every frame it gets');
  assert.equal(dividerFor(null, 30), 1);
  assert.equal(dividerFor(60, 0), 1);
});

test('a 30 fps target on a 60 Hz display draws every second frame, evenly', () => {
  const p = createFramePacer({ targetFps: 30 });
  const r = run(p, ticks(60, 600, { jitter: 1.2 }));
  assert.equal(p.divider, 2);
  assert.ok(Math.abs(r.fps - 30) < 0.6, `ran at ${r.fps.toFixed(2)} fps`);
});

test('the old threshold pacer judders where this one does not', () => {
  // The retired rule: draw when ≥ 1000/30 ms has passed since the last frame. With jitter the due
  // tick is often missed by a fraction of a millisecond and the frame slips to the NEXT tick.
  const old = () => { let last = null; return { tick: (t) => { if (last == null || t - last >= 1000 / 30) { last = t; return { render: true }; } return { render: false }; } }; };
  const ts = ticks(60, 600, { jitter: 1.2 });
  const before = run(old(), ts).fps;
  const after = run(createFramePacer({ targetFps: 30 }), ts).fps;
  assert.ok(before < 27, `the threshold pacer measured ${before.toFixed(2)} fps — the premise of this fix no longer holds`);
  assert.ok(after > 29.4, `the divider pacer measured ${after.toFixed(2)} fps`);
});

test('120 Hz and 144 Hz displays stay at or under the target', () => {
  for (const [hz, want] of [[120, 30], [144, 28.8]]) {
    const p = createFramePacer({ targetFps: 30 });
    const r = run(p, ticks(hz, 1200));
    assert.ok(r.fps <= 30.05 && r.fps > want - 1, `${hz} Hz ran at ${r.fps.toFixed(2)} fps`);
  }
  const p60 = createFramePacer({ targetFps: 60 });
  assert.ok(Math.abs(run(p60, ticks(60, 600)).fps - 60) < 0.5, 'a 60 fps target on 60 Hz draws every frame');
});

test('a dropped tick costs one tick, not a whole extra period', () => {
  const p = createFramePacer({ targetFps: 30 });
  // Warm up, then drop every frame that would have been drawn once.
  const ts = ticks(60, 400, { drop: (i) => i > 100 && i % 10 === 4 });
  const r = run(p, ts);
  assert.ok(r.fps > 29, `ran at ${r.fps.toFixed(2)} fps with occasional dropped ticks`);
});

test('before the display is measured it assumes 60 Hz, not every tick', () => {
  const p = createFramePacer({ targetFps: 30 });
  assert.equal(p.divider, 2);
  // The first few ticks of a 120 Hz display: drawn about every 25 ms, not every 8.3 ms.
  const drawn = ticks(120, MIN_SAMPLES).filter((t) => p.tick(t).render).length;
  assert.ok(drawn <= Math.ceil(MIN_SAMPLES / 3) + 1, `drew ${drawn} of the first ${MIN_SAMPLES} ticks`);
});

test('the simulated step is the real time since the last drawn frame, and a pause is not a frame', () => {
  const p = createFramePacer({ targetFps: 30 });
  const ts = ticks(60, 60);
  const dts = ts.map((t) => p.tick(t)).filter((x) => x.render).map((x) => x.dt);
  assert.equal(dts[0], 0, 'the first frame has nothing to step from');
  for (const dt of dts.slice(MIN_SAMPLES)) assert.ok(Math.abs(dt - 1 / 30) < 0.002, `stepped ${dt}`);
  // A long gap (the page was hidden), then reset(): the next frame starts fresh.
  p.reset();
  assert.deepEqual(p.tick(999999), { render: true, dt: 0 });
  assert.ok(Math.abs(p.hz - 60) < 0.5, 'reset forgot the display rate it had measured');
});

test('a portrait box widens the lens just enough, and never narrows it', () => {
  // Landscape and wider: untouched.
  assert.equal(fitFov(38, REF_ASPECT), 38);
  assert.equal(fitFov(38, 2.39), 38);
  // 4:5 phone box, a 38° shot: wider, and it keeps the stated share of the 16:9 width.
  const f = fitFov(38, 0.8, { keep: 0.72 });
  assert.ok(f > 38 && f < 72, `widened to ${f}`);
  const halfW = (fov, aspect) => Math.tan((fov * Math.PI) / 360) * aspect;
  assert.ok(Math.abs(halfW(f, 0.8) - halfW(38, REF_ASPECT) * 0.72) < 1e-9, 'did not keep 72% of the 16:9 coverage');
  // Monotone in the box: narrower boxes need more lens.
  assert.ok(fitFov(38, 0.6) > fitFov(38, 0.8));
  // Capped, unless the shot itself is wider than the cap.
  assert.equal(fitFov(58, 0.4), 72);
  assert.equal(fitFov(80, 0.4), 80);
  // Bad input passes through.
  assert.equal(fitFov(38, 0), 38);
  assert.ok(Number.isNaN(fitFov(NaN, 0.8)));
});
