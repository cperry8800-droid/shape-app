import React from 'react';
import {
  rlGels, rlRgbVar, RL_HEADS, rlBeamAngle, rlBeamOn, rlWashOn, rlPoolOn, rlEdgeOn, rlEdgeChase,
} from '../services/radioLight.mjs';

// The light layers of Shape Radio's light effects (Settings → Light effects),
// all following one reading of the music (iosAppReactive.jsx `radioLight`):
//   RadioBgBloom     — a soft pool of colour drifting behind everything (every mode)
//   RadioEdgeLight   — a strip of light down each side and along the floor (every mode)
//   RadioStageLights — Immersive and up: four heads along the top edge throw
//                      beams across the screen, sweeping, pulsing on the kick and
//                      swinging together on the drop, over a wash from the top and
//                      a pool on the floor
// Two gels per rig: the effect colour and its two-tone partner (the Radio page's
// hot tone), deepened on light paper so they read there (rlGels).
//
// Cost: every layer is static, painted once. One rAF loop per layer writes only
// transform and opacity, and only when a quantised value changes; colours move
// through CSS variables at most ~3 times a second while the palette cycles.
// React never re-renders a layer per frame. ⚠ The layers sit ABOVE the member's
// content: none draws a line, only soft light, and the edge light stays at the
// edges, so no word is ever crossed by a stroke.

const RL_Q = Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2));
const RL_PAL_MS = 300;
const rlQ = (v) => RL_Q[Math.max(0, Math.min(100, Math.round(100 * v)))];
const rlA = (v, a) => `rgba(var(${v}), ${a})`;

// One loop per layer: `draw(read, put)` runs each frame with the shared reading;
// `put` writes a style only when it changed. The gels follow the tint.
function useRlLoop(enabled, root, sample, color, isLight, draw) {
  const tint = React.useRef(color);
  tint.current = color;
  const sampleRef = React.useRef(sample);
  sampleRef.current = sample;
  const drawRef = React.useRef(draw);
  drawRef.current = draw;
  React.useLayoutEffect(() => {
    if (!enabled) return undefined;
    const el = root.current;
    if (!el) return undefined;
    const memo = new Map();
    const put = (node, k, v) => {
      if (!node) return;
      let m = memo.get(node);
      if (!m) memo.set(node, (m = {}));
      if (m[k] !== v) { m[k] = v; node.style[k] = v; }
    };
    let raf = 0, palAt = -1e9, palKey = '';
    const frame = (now) => {
      if (now - palAt >= RL_PAL_MS || now < palAt) {
        palAt = now;
        const key = String(tint.current);
        if (key !== palKey) {
          palKey = key;
          const [a, b] = rlGels(key, isLight);
          el.style.setProperty('--rl-a', rlRgbVar(a));
          el.style.setProperty('--rl-b', rlRgbVar(b));
        }
      }
      const read = sampleRef.current ? sampleRef.current(now) : null;
      if (read) drawRef.current(read, put);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [enabled, isLight, root]);
}

function rlRootStyle(color, isLight, zIndex) {
  const [a, b] = rlGels(color, isLight);
  return { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex, overflow: 'hidden', '--rl-a': rlRgbVar(a), '--rl-b': rlRgbVar(b) };
}

export function RadioBgBloom({ enabled = true, color = '#0ac5a8', isLight = false, sample = null }) {
  const root = React.useRef(null);
  const blob = React.useRef(null);
  useRlLoop(enabled, root, sample, color, isLight, (read, put) => {
    const t = read.clock != null ? read.clock / 1000 : read.t / 1000;
    const dx = Math.sin(t * 0.3) * 15, dy = Math.cos(t * 0.22) * 15;
    put(blob.current, 'transform', `translate(${dx.toFixed(1)}%, ${dy.toFixed(1)}%) scale(${(1 + 0.25 * read.kick).toFixed(3)})`);
    put(blob.current, 'opacity', rlQ(0.55 + 0.45 * Math.max(read.kick, read.level * 0.6)));
  });
  if (!enabled) return null;
  return (
    <div ref={root} aria-hidden="true" style={rlRootStyle(color, isLight, 0)}>
      <div ref={blob} style={{ position: 'absolute', left: '-10%', top: '-10%', width: '120%', height: '100%', willChange: 'transform, opacity',
        background: `radial-gradient(42% 42% at 50% 40%, ${rlA('--rl-a', isLight ? 0.12 : 0.11)}, transparent 70%)` }} />
    </div>
  );
}

export function RadioEdgeLight({ enabled = true, color = '#0ac5a8', isLight = false, floor = 0, sample = null }) {
  const root = React.useRef(null);
  const R = React.useRef({});
  const bind = (k) => (el) => { R.current[k] = el; };
  useRlLoop(enabled, root, sample, color, isLight, (read, put) => {
    const on = rlQ(rlEdgeOn(read));
    put(R.current.l, 'opacity', on); put(R.current.r, 'opacity', on); put(R.current.f, 'opacity', on);
    const y = rlEdgeChase(read);
    const ty = `translateY(${(y * 100).toFixed(1)}%)`;
    put(R.current.lc, 'transform', ty); put(R.current.rc, 'transform', ty);
    put(R.current.lc, 'opacity', rlQ(0.35 + 0.65 * read.kick)); put(R.current.rc, 'opacity', rlQ(0.35 + 0.65 * read.kick));
  });
  if (!enabled) return null;
  // a crisp line right at the edge over a soft glow, like an LED strip behind
  // the screen's rim; deeper gels on light paper (rlGels) carry it there.
  // ⚠ THE GLOW STOPS 22 PX IN: right-aligned figures (Train's "165 lb") end
  // ~12 px from the edge, and a 44 px glow measurably dimmed them (1.1-1.3% of
  // text edges on Train); at 22 px it does not reach a word
  const line = isLight ? 0.78 : 0.85, glow = isLight ? 0.26 : 0.3, run = isLight ? 0.5 : 0.6;
  const toward = (dir) => (dir === 'left' ? 'right' : 'left');
  const side = (k, gel, dir) => (
    <div ref={bind(k)} style={{ position: 'absolute', top: 0, bottom: floor, [dir]: 0, width: 24, willChange: 'opacity',
      background: `linear-gradient(to ${toward(dir)}, ${rlA(gel, line)} 0, ${rlA(gel, line)} 2px, ${rlA(gel, glow)} 2px, ${rlA(gel, glow * 0.3)} 9px, transparent 22px)`,
      WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 10%, #000 90%, transparent)',
      maskImage: 'linear-gradient(to bottom, transparent, #000 10%, #000 90%, transparent)' }}>
      {/* the runner: a brighter stretch that travels down the side once a bar */}
      <div ref={bind(k + 'c')} style={{ position: 'absolute', left: 0, right: 0, top: '-24%', height: '24%', willChange: 'transform, opacity',
        background: `linear-gradient(to ${toward(dir)}, ${rlA(gel, 1)} 0, ${rlA(gel, 1)} 2px, ${rlA(gel, run)} 2px, ${rlA(gel, run * 0.3)} 9px, transparent 22px)`,
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 35%, #000 65%, transparent)',
        maskImage: 'linear-gradient(to bottom, transparent, #000 35%, #000 65%, transparent)' }} />
    </div>
  );
  return (
    <div ref={root} aria-hidden="true" style={rlRootStyle(color, isLight, 9)}>
      {side('l', '--rl-a', 'left')}
      {side('r', '--rl-b', 'right')}
      {/* the floor: the same strip along the tab bar's top edge (or the screen's) */}
      <div ref={bind('f')} style={{ position: 'absolute', left: 0, right: 0, bottom: floor, height: 30, willChange: 'opacity',
        background: `linear-gradient(to top, ${rlA('--rl-a', line * 0.8)} 0, ${rlA('--rl-a', line * 0.8)} 2px, ${rlA('--rl-a', glow * 0.8)} 2px, transparent 30px)`,
        WebkitMaskImage: 'linear-gradient(to right, transparent, #000 15%, #000 85%, transparent)',
        maskImage: 'linear-gradient(to right, transparent, #000 15%, #000 85%, transparent)' }} />
    </div>
  );
}

export function RadioStageLights({ enabled = true, color = '#0ac5a8', isLight = false, floor = 64, sample = null }) {
  const root = React.useRef(null);
  const R = React.useRef({});
  const bind = (k) => (el) => { R.current[k] = el; };
  useRlLoop(enabled, root, sample, color, isLight, (read, put) => {
    RL_HEADS.forEach((h, i) => {
      put(R.current[`b${i}`], 'transform', `rotate(${rlBeamAngle(i, read).toFixed(1)}deg)`);
      put(R.current[`b${i}`], 'opacity', rlQ(rlBeamOn(i, read)));
      put(R.current[`h${i}`], 'opacity', rlQ(0.5 + 0.5 * read.kick));
    });
    put(R.current.wash, 'opacity', rlQ(rlWashOn(read)));
    put(R.current.pool, 'opacity', rlQ(rlPoolOn(read)));
    put(R.current.pool, 'transform', `scale(${(1 + 0.06 * read.kick).toFixed(3)})`);
  });
  if (!enabled) return null;
  const beamA = isLight ? 0.2 : 0.16;
  return (
    <div ref={root} aria-hidden="true" style={rlRootStyle(color, isLight, 1)}>
      {/* the wash from the top */}
      <div ref={bind('wash')} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '34%', willChange: 'opacity',
        background: `linear-gradient(to bottom, ${rlA('--rl-a', 0.2)}, transparent)` }} />
      {RL_HEADS.map((h, i) => {
        const gel = h.hot ? '--rl-b' : '--rl-a';
        return (
          <div key={i} style={{ position: 'absolute', left: `${h.x * 100}%`, top: -6, width: 0, height: 0 }}>
            <div ref={bind(`b${i}`)} style={{ position: 'absolute', left: -90, top: 0, width: 180, height: 900, transformOrigin: '90px 0', willChange: 'transform, opacity',
              clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0 100%)',
              background: `linear-gradient(90deg, transparent 10%, ${rlA(gel, beamA * 0.45)} 34%, ${rlA(gel, beamA * 1.5)} 50%, ${rlA(gel, beamA * 0.45)} 66%, transparent 90%)`,
              WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.55) 45%, transparent 85%)',
              maskImage: 'linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.55) 45%, transparent 85%)' }} />
            {/* the fixture itself, a small lit lens on the top edge */}
            <div ref={bind(`h${i}`)} style={{ position: 'absolute', left: -7, top: 2, width: 14, height: 6, borderRadius: 3, willChange: 'opacity',
              background: rlA(gel, 1), boxShadow: `0 0 10px 2px ${rlA(gel, 0.6)}` }} />
          </div>
        );
      })}
      {/* the pool of light on the floor (the tab bar's top edge) */}
      <div ref={bind('pool')} style={{ position: 'absolute', left: '-6%', right: '-6%', bottom: floor - 70, height: 140, willChange: 'opacity, transform', transformOrigin: '50% 50%',
        background: `radial-gradient(50% 50% at 50% 50%, ${rlA('--rl-a', isLight ? 0.3 : 0.36)}, ${rlA('--rl-a', isLight ? 0.09 : 0.1)} 55%, transparent 72%)` }} />
    </div>
  );
}
