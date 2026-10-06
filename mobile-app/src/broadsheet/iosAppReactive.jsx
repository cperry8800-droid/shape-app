import React from 'react';
import { RadioHologramDJ } from './iosAppHologramDJ.jsx';
import { RadioBgBloom, RadioEdgeLight, RadioStageLights } from './iosAppRadioLights.jsx';
import { rlInitial, rlStep, rlRead, rlBandsOf, rlHasSignal, rlDemo, rlIdle } from '../services/radioLight.mjs';
// Music-reactive light effects for Shape Radio (Settings → Light effects).
//
// Every layer follows ONE reading of the music per frame (`radioLight` below,
// rules in services/radioLight.mjs):
//   measured — the radio is playing and its analyser can be read: the lights
//              follow the music's level, its kicks and its drops;
//   idle     — playing, but the stream cannot be read (no CORS, or no stream):
//              the lights breathe and claim no beat;
//   demo     — nothing playing (the Settings tap-to-preview): a 132 BPM clock.
//
// Intensity modes:
//   'off'       — no effects (just the static Home)
//   'subtle'    — the edge light, a drifting bloom, the island's EQ
//   'immersive' — adds the stage lights (iosAppRadioLights.jsx)
//   'hologram'  — adds the projected DJ at the booth (iosAppHologramDJ.jsx)
//
// Everything is strictly cosmetic; content/interactivity unchanged.

const { useState: useStateF, useEffect: useEffectF } = React;

// ─────────────────────────────────────────────────────────────
// The shared reading: one per animation frame, however many layers ask. The
// first layer to ask in a frame reads the analyser; the rest get its answer.
// ─────────────────────────────────────────────────────────────
const RL_STATE = { t0: null, at: -1, live: null, read: null, state: rlInitial(), lastMs: null, bins: null };
function radioLightAnalyser() {
  try {
    const radio = typeof window !== 'undefined' ? window.ShapeRadioLive : null;
    return radio && radio.analyser ? radio.analyser() : null;
  } catch (e) { return null; }
}
function radioLight(now, live) {
  const S = RL_STATE;
  if (now === S.at && live === S.live && S.read) return S.read;
  // a fresh start after any pause or a switch of source: the 6 s Settings
  // preview always opens at the top of its demo, drop included
  if (S.t0 === null || now - S.at > 1000 || live !== S.live) S.t0 = now;
  const ms = Math.max(0, now - S.t0);
  let read;
  if (!live) {
    S.state = rlInitial(); S.lastMs = null;
    read = rlDemo(ms);
  } else {
    const an = radioLightAnalyser();
    let bins = null;
    if (an && an.frequencyBinCount) {
      if (!S.bins || S.bins.length !== an.frequencyBinCount) S.bins = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(S.bins);
      bins = S.bins;
    }
    // ⚠ AN ALL-ZERO FRAME IS A STREAM WE CANNOT READ, NOT SILENCE: the lights
    // breathe instead of dancing to a beat nobody measured
    if (rlHasSignal(bins)) {
      S.state = rlStep(S.state, rlBandsOf(bins), S.lastMs === null ? 0 : ms - S.lastMs);
      S.lastMs = ms;
      read = rlRead(S.state, 'measured');
    } else {
      S.state = rlInitial(); S.lastMs = null;
      read = rlIdle(ms);
    }
  }
  read = { ...read, clock: ms };
  S.at = now; S.live = live; S.read = read;
  return read;
}

// useBeat — the shared reading, re-rendered each frame for the React layers.
// { pulse (the kick: 1 on a hit), bass, mid, treble, level, drop, t (s), source }
function useBeat(on = true, live = false) {
  const [read, setRead] = useStateF(null);
  useEffectF(() => {
    if (!on) return undefined;
    let alive = true, raf = 0;
    const loop = (now) => { if (!alive) return; setRead(radioLight(now, live)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [on, live]);
  if (!on || !read) return { beat: 0, pulse: 0, t: 0, bass: 0, mid: 0, treble: 0, level: 0, drop: 0, source: null };
  return {
    beat: read.bar, pulse: read.kick, t: read.clock / 1000,
    bass: read.measured ? Math.max(read.kick, read.bass) : read.kick,
    mid: read.mid, treble: read.high, level: read.level, drop: read.drop, source: read.source,
  };
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

// The edge light, the bloom and the stage lights are in iosAppRadioLights.jsx.

function RadioDynamicIsland({ enabled = true, color = '#0ac5a8', label = 'Shape Radio · 132', live = false }) {
  const { bass, mid, treble, t, source } = useBeat(enabled, live);
  if (!enabled) return null;
  const bars = Array.from({ length: 7 }).map((_, i) => {
    // with nothing to read, the bars only breathe: an EQ dancing to no music
    // is a reading nobody took
    const wave = (Math.sin(t * (6 + i * 1.2) + i) * 0.4 + 0.6) * (source === 'idle' ? 0.25 : 1);
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
// isLight: the paper under the overlay (light paper deepens every gel).
// floor: CSS px the tab bar takes at the bottom (0 where there is none).
// preview: the Settings tap-to-preview (the hologram's glass over the swatches).
// live: the radio is playing — read the music; otherwise the demo beat.
function RadioEffects({ mode = 'subtle', label = 'Shape Radio · 132', tint = null, isLight = false, floor = 0, preview = false, live = false }) {
  const on = mode !== 'off';
  const { t } = useBeat(on, live);
  const sample = React.useCallback((now) => radioLight(now, live), [live]);
  const color = tint || cycleColor(t, 18);
  if (!on) return null;
  const staged = mode === 'immersive' || mode === 'hologram';
  return (
    <>
      <RadioBgBloom color={color} isLight={isLight} sample={sample} />
      {staged && <RadioStageLights color={color} isLight={isLight} floor={floor} sample={sample} />}
      <RadioEdgeLight color={color} isLight={isLight} floor={floor} sample={sample} />
      <RadioDynamicIsland color={color} label={label} enabled={true} live={live} />
      {mode === 'hologram' && <RadioHologramDJ color={color} isLight={isLight} floor={floor} preview={preview} sample={sample} />}
    </>
  );
}

Object.assign(window, { useBeat, radioLight, Halo, RadioEffects, RadioEdgeLight, RadioBgBloom, RadioStageLights, RadioDynamicIsland, RadioHologramDJ, cycleColor, mixHex });
