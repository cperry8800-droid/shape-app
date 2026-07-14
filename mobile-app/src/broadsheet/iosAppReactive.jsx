import React from 'react';
// Music-reactive effects for Shape Radio
// Simulates BPM-synced visual effects. With real audio we'd use Web Audio API
// + AnalyserNode; here we fake it with a 132 BPM clock (454ms per beat) and
// sine-based bass/mid/treble channels.
//
// Intensity modes:
//   'off'       — no effects (just the static Home)
//   'subtle'    — edge glow + breathing hero + EQ mini-bars on Dynamic Island
//   'immersive' — adds button halos, bg gradient shift, particle accents
//   'hologram'  — adds a ghost DJ figure with scanlines overlay
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

// The hologram DJ — "The Booth" (owner picks 2026-07-14: a more realistic
// hologram, staged at the booth). A bottom-anchored close-up: an oversized
// console spans the screen's bottom edge (two large spinning perspective
// platters w/ tone arms + a live 3-fader mixer) with a realistically-
// proportioned volumetric bust rising behind it — head/jaw, neck, headphones,
// real shoulders, left hand working the left platter (scratch wobble), the
// right an open raised hand (fingers) pumping on the kick. Hologram
// treatment: scanline banding, chromatic double-image (fixed cyan/magenta
// ghosts so the RGB split reads on any tint), deterministic glitch-slice
// bursts (no Math.random — replay-safe), flicker, EQ towers behind. All
// currentColor inside one <g> so the <use> layers retint; ids are per-mount
// (React.useId, the #1518 duplicate-SVG-id lesson). tint = the Settings fx
// color (null keeps the cycling palette).
function RadioHologramDJ({ enabled = true, color = '#0ac5a8' }) {
  const { bass, mid, t } = useBeat(enabled);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!enabled) return null;

  const figId = `holo-dj-${uid}`, scanId = `holo-scan-${uid}`, linesId = `holo-lines-${uid}`, sliceId = `holo-slice-${uid}`;
  const cyc = Math.floor(t / 3.7);
  const inBurst = (t % 3.7) < 0.18;
  const flicker = (0.93 + 0.07 * Math.sin(t * 31)) * (inBurst ? 0.82 : 1);
  const opacity = Math.min(0.5, (0.4 + bass * 0.1) * flicker); // overlay stays quiet over content
  const floatY = Math.sin(t * 0.9) * 5;
  const bob = bass * 7;
  const armPump = -6 - bass * 16;
  const scratch = Math.sin(t * 9) * (bass > 0.5 ? 14 : 3.5); // left-deck scratch wobble
  const deckA = t * 3.1 + scratch * 0.06, deckB = t * -2.6;

  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `repeating-linear-gradient(0deg, ${color}0a 0px, ${color}0a 1px, transparent 1px, transparent 3px)`,
        opacity: 0.4 + mid * 0.2,
        mixBlendMode: 'multiply',
      }} />

      <svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMax slice"
        style={{ position: 'absolute', inset: 0, transform: `translateY(${floatY}px)`, opacity }}>
        <defs>
          <pattern id={linesId} x="0" y="0" width="1" height="4" patternUnits="userSpaceOnUse">
            <rect width="1" height="2.4" fill="white" />
          </pattern>
          <mask id={scanId}>
            <rect width="400" height="800" fill={`url(#${linesId})`} />
          </mask>
          <clipPath id={sliceId}>
            <rect x="0" y={340 + ((cyc * 137) % 340)} width="400" height={24 + ((cyc * 53) % 32)} />
          </clipPath>

          <g id={figId}>
            {/* the bust — head/jaw, neck, headphones, shoulders → waist behind the console */}
            <g transform={`translate(0 ${bob})`}>
              <path d="M 200 348 C 225 348 237 366 237 390 C 237 411 228 429 213 435 C 208 438 192 438 187 435 C 172 429 163 411 163 390 C 163 366 175 348 200 348 Z" fill="currentColor" opacity="0.56" />
              <path d="M 185 432 L 215 432 L 221 472 L 179 472 Z" fill="currentColor" opacity="0.5" />
              <path d="M 158 375 C 167 341 233 341 242 375" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" opacity="0.85" />
              <ellipse cx="158" cy="393" rx="13" ry="20" fill="currentColor" opacity="0.9" />
              <ellipse cx="242" cy="393" rx="13" ry="20" fill="currentColor" opacity="0.9" />
              <path d="M 179 468 C 138 477 108 492 99 518 L 108 548 C 122 574 130 606 128 644 L 272 644 C 270 606 278 574 292 548 L 301 518 C 292 492 262 477 221 468 C 208 464 192 464 179 468 Z" fill="currentColor" opacity="0.44" />
              {/* left arm — down to the left platter */}
              <path d="M 96 508 C 76 538 66 570 64 600 C 63 620 66 636 72 650 C 80 660 96 660 100 648 C 94 630 90 610 92 588 C 94 562 100 538 110 522 Z" fill="currentColor" opacity="0.5" />
              {/* the raised open hand, pumping at the shoulder */}
              <g transform={`rotate(${armPump} 298 512)`}>
                <path d="M 290 496 C 322 484 348 466 366 442 C 378 426 386 408 390 390 L 370 382 C 362 400 352 416 340 430 C 322 450 304 466 288 478 Z" fill="currentColor" opacity="0.5" />
                <ellipse cx="384" cy="368" rx="13" ry="19" fill="currentColor" opacity="0.55" transform="rotate(-18 384 368)" />
                <path d="M 374 350 L 371 331 M 385 347 L 385 326 M 396 350 L 400 332" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.4" />
              </g>
              {/* rim light on the silhouette edges */}
              <path d="M 200 348 C 225 348 237 366 237 390 C 237 411 228 429 213 435 M 187 435 C 172 429 163 411 163 390 C 163 366 175 348 200 348" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.85" strokeLinecap="round" />
              <path d="M 179 468 C 138 477 108 492 99 518 M 301 518 C 292 492 262 477 221 468" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7" strokeLinecap="round" />
            </g>
            {/* the booth console — spans the bottom edge, in front of the bust */}
            <path d="M 8 640 L 392 640 L 404 700 L -4 700 Z" fill="currentColor" opacity="0.10" />
            <path d="M -4 700 L 404 700 L 410 800 L -10 800 Z" fill="currentColor" opacity="0.06" />
            <line x1="8" y1="640" x2="392" y2="640" stroke="currentColor" strokeWidth="3" opacity="0.9" />
            <line x1="-4" y1="700" x2="404" y2="700" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
            {[{ cx: 96, a: deckA }, { cx: 304, a: deckB }].map(({ cx, a }) => (
              <g key={cx}>
                <ellipse cx={cx} cy="668" rx="64" ry="20" fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.9" />
                <ellipse cx={cx} cy="668" rx="42" ry="13.2" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
                <ellipse cx={cx} cy="668" rx="6" ry="2.2" fill="currentColor" opacity="0.9" />
                <circle cx={cx + Math.cos(a) * 52} cy={668 + Math.sin(a) * 16.5} r="3.4" fill="currentColor" opacity="0.95" />
                <path d={`M ${cx + 52} 648 L ${cx + 30} 664`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
              </g>
            ))}
            <rect x="168" y="652" width="64" height="38" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.7" />
            {[182, 200, 218].map((x, i) => (
              <g key={x}>
                <line x1={x} y1="659" x2={x} y2="683" stroke="currentColor" strokeWidth="1.1" opacity="0.4" />
                <rect x={x - 5} y={666 + Math.sin(t * 1.2 + i * 2.1) * 8} width="10" height="4.5" rx="1.8" fill="currentColor" opacity="0.85" />
              </g>
            ))}
          </g>
        </defs>

        {/* EQ towers behind the figure */}
        <g mask={`url(#${scanId})`} opacity="0.18">
          {Array.from({ length: 7 }).map((_, i) => {
            const h = 60 + Math.abs(Math.sin(t * 5.5 + i * 1.2)) * (140 + bass * 160);
            return <rect key={i} x={36 + i * 52} y={636 - h} width="9" height={h} rx="2" fill={color} />;
          })}
        </g>

        {/* aura → chromatic ghosts → the figure → glitch slice */}
        <use href={`#${figId}`} mask={`url(#${scanId})`} opacity={0.12 + bass * 0.1} transform="translate(-4 -12) scale(1.02)" style={{ color }} />
        <use href={`#${figId}`} mask={`url(#${scanId})`} opacity="0.10" transform={`translate(${-2.2 - bass * 1.8} 0)`} style={{ color: '#6fe0ff' }} />
        <use href={`#${figId}`} mask={`url(#${scanId})`} opacity="0.10" transform={`translate(${2.2 + bass * 1.8} 0)`} style={{ color: '#ff7ad9' }} />
        <use href={`#${figId}`} mask={`url(#${scanId})`} style={{ color }} />
        {inBurst && (
          <use href={`#${figId}`} clipPath={`url(#${sliceId})`} opacity="0.7" transform={`translate(${7 + (cyc % 3) * 4} 0)`} style={{ color }} />
        )}
      </svg>

      <div style={{
        position: 'absolute', top: `${((t * 28) % 120) - 10}%`, left: 0, right: 0, height: 30,
        background: `linear-gradient(to bottom, transparent, ${color}22, transparent)`,
      }} />
    </div>
  );
}

// tint: a fixed hex pins every layer to one color (the Settings fx color
// picker — 'cycle' passes null and keeps the drifting 18s palette).
function RadioEffects({ mode = 'subtle', label = 'Shape Radio · 132', tint = null }) {
  const on = mode !== 'off';
  const { t } = useBeat(on);
  const color = tint || cycleColor(t, 18);
  if (!on) return null;
  return (
    <>
      <RadioBgBloom color={color} enabled={true} />
      <RadioEdgeGlow color={color} enabled={true} />
      <RadioDynamicIsland color={color} label={label} enabled={true} />
      {(mode === 'immersive' || mode === 'hologram') && <RadioHologramDJ color={color} enabled={mode === 'hologram'} />}
    </>
  );
}

Object.assign(window, { useBeat, Halo, RadioEffects, RadioEdgeGlow, RadioBgBloom, RadioDynamicIsland, RadioHologramDJ, cycleColor, mixHex });
