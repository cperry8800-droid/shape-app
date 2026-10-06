import React from 'react';
import { RadioHologramDJ } from './iosAppHologramDJ.jsx';
// Music-reactive effects for Shape Radio
// Simulates BPM-synced visual effects. With real audio we'd use Web Audio API
// + AnalyserNode; here we fake it with a 132 BPM clock (454ms per beat) and
// sine-based bass/mid/treble channels.
//
// Intensity modes:
//   'off'       — no effects (just the static Home)
//   'subtle'    — edge glow + breathing hero + EQ mini-bars on Dynamic Island
//   'immersive' — adds button halos, bg gradient shift, particle accents
//   'hologram'  — adds the projected DJ at the booth (iosAppHologramDJ.jsx)
//
// Everything is strictly cosmetic; content/interactivity unchanged.

const { useState: useStateF, useEffect: useEffectF, useRef: useRefF } = React;

// 132 BPM = one beat every 454.5ms
const BPM = 132;
const BEAT_MS = 60000 / BPM;

// ─────────────────────────────────────────────────────────────
// useBeat — returns { beat (0..1 progress within beat), pulse (0..1, exp decay on kick), t (seconds) }
// ─────────────────────────────────────────────────────────────
function useBeat(on = true) {
  const [tick, setTick] = useStateF(0);
  const startRef = useRefF(performance.now());
  const rafRef = useRefF();

  useEffectF(() => {
    if (!on) return;
    let alive = true;
    function loop(now) {
      if (!alive) return;
      setTick(now - startRef.current);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [on]);

  if (!on) return { beat: 0, pulse: 0, t: 0, bass: 0, mid: 0, treble: 0 };

  const t = tick / 1000;
  const beatPhase = (tick % BEAT_MS) / BEAT_MS;
  const pulse = Math.pow(1 - beatPhase, 3);
  const bass = pulse;
  const mid = Math.pow(1 - ((tick + BEAT_MS / 2) % BEAT_MS) / BEAT_MS, 2) * 0.7;
  const treble = (Math.sin(t * 18) * 0.5 + 0.5) * 0.5 + 0.5 * Math.sin(t * 7);
  return { beat: beatPhase, pulse, t, bass, mid: Math.max(0, mid), treble: Math.max(0, treble) };
}

const FX_COLORS = ['#0ac5a8', '#e37a5a', '#d9b26a', '#8c6fa8'];

function mixHex(a, b, t) {
  if (!a || !b) return a || b || '#0ac5a8';
  const pa = [1,3,5].map(i => parseInt(a.slice(i, i+2), 16));
  const pb = [1,3,5].map(i => parseInt(b.slice(i, i+2), 16));
  const m = pa.map((c, i) => Math.round(c + (pb[i] - c) * t));
  return '#' + m.map(c => c.toString(16).padStart(2, '0')).join('');
}

function cycleColor(tSec, period = 18) {
  const n = FX_COLORS.length;
  const safeT = (tSec && isFinite(tSec) && tSec > 0) ? tSec : 0;
  const raw = (safeT / period) % n;
  const idx = ((raw % n) + n) % n; // always 0..n-1
  const i = Math.floor(idx);
  const frac = idx - i;
  return mixHex(FX_COLORS[i], FX_COLORS[(i + 1) % n], frac);
}

function RadioEdgeGlow({ color = '#0ac5a8', enabled = true }) {
  const { bass } = useBeat(enabled);
  if (!enabled) return null;
  const intensity = 0.3 + bass * 0.5;
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9,
      boxShadow: `inset 0 0 ${40 + bass * 80}px ${18 + bass * 24}px ${color}${Math.round(intensity * 40).toString(16).padStart(2, '0')}`,
      transition: 'box-shadow 60ms linear',
      borderRadius: 40,
    }} />
  );
}

function RadioBgBloom({ color = '#0ac5a8', enabled = true }) {
  const { bass, t } = useBeat(enabled);
  if (!enabled) return null;
  const x = 50 + Math.sin(t * 0.3) * 15;
  const y = 40 + Math.cos(t * 0.22) * 15;
  const size = 40 + bass * 25;
  const alpha = 0.06 + bass * 0.08;
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
      background: `radial-gradient(${size}% ${size}% at ${x}% ${y}%, ${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
      transition: 'background 80ms linear',
    }} />
  );
}

function RadioDynamicIsland({ enabled = true, color = '#0ac5a8', label = 'Shape Radio · 132' }) {
  const { bass, mid, treble, t } = useBeat(enabled);
  if (!enabled) return null;
  const bars = Array.from({ length: 7 }).map((_, i) => {
    const wave = Math.sin(t * (6 + i * 1.2) + i) * 0.4 + 0.6;
    return Math.max(0.15, (i < 2 ? bass : i < 4 ? mid : treble) * 0.6 + wave * 0.4);
  });
  return (
    <div style={{
      position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
      height: 37, borderRadius: 24, background: '#000', zIndex: 51,
      display: 'flex', alignItems: 'center', padding: '0 12px 0 14px',
      gap: 10, pointerEvents: 'none',
      minWidth: 200,
      boxShadow: `0 0 ${12 + bass * 20}px ${color}${Math.round((0.25 + bass * 0.35) * 255).toString(16).padStart(2, '0')}`,
      transition: 'box-shadow 60ms linear',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: 3, background: color,
        boxShadow: `0 0 ${4 + bass * 8}px ${color}`, flexShrink: 0,
      }} />
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.14em',
        color: '#fff', textTransform: 'uppercase', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden',
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            width: 2, height: `${h * 100}%`, background: color, borderRadius: 1,
            transition: 'height 60ms linear',
          }} />
        ))}
      </div>
    </div>
  );
}

function Halo({ color = '#0ac5a8', enabled = true, radius = 22, children, style }) {
  const { bass } = useBeat(enabled);
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      {enabled && (
        <div style={{
          position: 'absolute', inset: -(bass * 12), borderRadius: radius + (bass * 12),
          background: `radial-gradient(circle, ${color}${Math.round((0.4 + bass * 0.35) * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          pointerEvents: 'none', zIndex: -1, filter: `blur(${8 + bass * 6}px)`,
          transition: 'inset 60ms linear',
        }} />
      )}
      {children}
    </div>
  );
}

// The hologram DJ ("The Booth") lives in its own module: iosAppHologramDJ.jsx
// draws it, services/hologramDj.mjs holds its pure beat, palette and geometry.

// tint: a fixed hex pins every layer to one color (the Settings fx color
// picker — 'cycle' passes null and keeps the drifting 18s palette).
// isLight: the paper under the overlay (the hologram prints as ink on light
// paper). floor: CSS px the tab bar takes at the bottom (0 where there is none).
// preview: the Settings tap-to-preview, where the booth stands on the colour
// swatches and gets a paper-coloured glass so it still reads there.
function RadioEffects({ mode = 'subtle', label = 'Shape Radio · 132', tint = null, isLight = false, floor = 0, preview = false }) {
  const on = mode !== 'off';
  const { t } = useBeat(on);
  const color = tint || cycleColor(t, 18);
  if (!on) return null;
  return (
    <>
      <RadioBgBloom color={color} enabled={true} />
      <RadioEdgeGlow color={color} enabled={true} />
      <RadioDynamicIsland color={color} label={label} enabled={true} />
      {mode === 'hologram' && <RadioHologramDJ color={color} isLight={isLight} floor={floor} preview={preview} />}
    </>
  );
}

Object.assign(window, { useBeat, Halo, RadioEffects, RadioEdgeGlow, RadioBgBloom, RadioDynamicIsland, RadioHologramDJ, cycleColor, mixHex });
