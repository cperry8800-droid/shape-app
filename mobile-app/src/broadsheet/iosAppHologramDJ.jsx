import React from 'react';
import {
  holoBeat, holoHash, holoGlitchAt, holoNormTint, holoPalette, holoGeometry,
  HOLO_RIG, HOLO_SLICE_PITCH, HOLO_CASING, HOLO_BEAT_MS,
} from '../services/hologramDj.mjs';

// The hologram DJ — "The Booth", redrawn 2026-10-06 (the owner's July
// composition, kept). A featureless light-form DJ stands
// behind a projected DJ setup on the floor line (the tab bar's top edge, or the
// surface's bottom edge when floor = 0): two decks and a mixer in one-point
// perspective, a compact projector on the console's back edge throwing a
// narrow cone up into the figure. The figure is a 3/4 view leaning over the
// left deck: one hand rocks the jog, the other holds the near headphone cup to
// the ear.
//
// Composition. The console is ~0.6 of the surface width, centred under the
// figure and right-aligned, so the left text column (x < ~130 of 350) stays
// clear; the figure stands in the band right of a screen's headline column,
// its crest below Home's first meal row. Every console line crosses the last
// content row, so none is above 0.3 alpha, and the console fades toward its
// ends. Nothing lit sits on the console's front row: the live accent is the VU
// on the mixer face.
//
// Treatment. Dark paper: a near-white fresnel rim, an inner falloff band, an
// upward-drifting slice texture at low alpha, a soft halo on the headphones
// and hands, a cyan/magenta split on the head that breathes on the kick (once
// a beat at most). Light paper: the same lines print as ink, the rim a clear
// step lighter than body text with a tinted inner line, blue/red split, no
// halos, no washes. Value: headphones and hands brightest, head next, arms,
// the torso quietest.
//
// floor = 0 (no tab bar): the rig is inset from the rounded corner so its base
// clears it. preview (the Settings tap-to-preview, which stands the rig on the
// colour swatches): it is drawn 1.15x, every rim gets a thin casing of the
// paper colour, the console's top surface a glass of it, and on dark paper the
// figure a faint one, so the DJ still reads over a swatch the same colour as
// the tint. Invisible on bare paper; never outside the preview.
//
// Cost: all drawing is static SVG, painted once, and again only when the tint
// moves (while the palette cycles, at most ~3 times a second; measured worst
// step 7 RGB levels on dark paper, 6 on light, mean ~2). No colour lives in a
// gradient stop or a pattern: fades are masks of fixed greys, so a tint change
// only restyles plain strokes and fills. Every moving part is a small
// composited box driven by transform/opacity from one rAF loop that never
// re-renders React; secondary channels are quantised so they are written only
// when they change, from precomputed strings. The VU swaps a precomputed path
// on a 16th note. The glitch ghost (a second copy of the figure, its own ids,
// no <use>) is display:none except during a 140 ms burst.

const HOLO_ABS = { position: 'absolute', display: 'block' };
const HOLO_PAL_MS = 300; // palette refresh period while the tint drifts (≤3.3 Hz)
const HOLO_JOG_MS = 33;  // platter markers turn in ~30 Hz steps, whatever the display rate
// every quantised value a channel can take, as the string the style wants:
// nothing that moves in steps builds a string per frame
const HOLO_Q = Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2));
const HOLO_SLICE_Y = Array.from({ length: Math.round(HOLO_SLICE_PITCH * 2) + 1 }, (_, i) => `translateY(${(-HOLO_SLICE_PITCH - i / 2).toFixed(1)}px)`);

let holoClipOk = null; // clip-path: path() (WebView 88+, Safari 13.1+); without it: no slices, no glitch
function holoClipPathOk() {
  if (holoClipOk === null) {
    // tested in the exact form the glitch writes (with a fill rule): an engine
    // that takes path() but not path(evenodd, …) would drop the cut silently
    try { const css = typeof window !== 'undefined' ? window.CSS : undefined; holoClipOk = !!(css && css.supports && css.supports('clip-path', "path(evenodd, 'M0 0H2V2H0Z M0.5 0.5H1V1H0.5Z')")); } catch (e) { holoClipOk = false; }
  }
  return holoClipOk;
}
function holoReduced() {
  try { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

function holoBoxStyle(G, k, extra) {
  const [x, y, w, h] = G.box[k], pv = G.pivot[k];
  return { ...HOLO_ABS, left: x, top: y, width: w, height: h, transformOrigin: `${(pv[0] - x).toFixed(1)}px ${(pv[1] - y).toFixed(1)}px`, ...extra };
}
function HoloSvg({ G, k, children }) {
  const [x, y, w, h] = G.box[k];
  return <svg width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>{children}</svg>;
}

// the paper-coloured casing under a set of rims (static colour)
function HoloCasing({ paths, light, w = 1, on = true }) {
  if (!on) return null;
  return (
    <g fill="none" stroke={light ? HOLO_CASING.light : HOLO_CASING.dark} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={light ? 0.6 : 0.5}>
      {paths.map(([d, pw], i) => <path key={i} d={d} strokeWidth={(pw || 1) * w + 1.8} />)}
    </g>
  );
}

// one silhouette: inner falloff (clipped to itself) + rim + interior lines
function HoloForm({ id, part, lines, light, rim = 1, w = 1.1, glow = 1, lineA = 0.35, mask, halo = 0 }) {
  return (
    <g mask={mask ? `url(#${mask})` : undefined}>
      <defs><clipPath id={id}><path d={part.sil} /></clipPath></defs>
      <g clipPath={`url(#${id})`} fill="none" style={{ stroke: 'var(--hl)' }}>
        {light
          ? <path d={part.sil} strokeWidth="3" strokeOpacity={0.5 * glow} />
          : <><path d={part.sil} strokeWidth="8" strokeOpacity={0.05 * glow} /><path d={part.sil} strokeWidth="2.8" strokeOpacity={0.17 * glow} /></>}
      </g>
      {halo > 0 && !light && <path d={part.rim} fill="none" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" strokeOpacity={halo} style={{ stroke: 'var(--hl)' }} />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--hr)' }}>
        {lines && <path d={lines} strokeWidth="0.75" strokeOpacity={lineA} />}
        <path d={part.rim} strokeWidth={w} strokeOpacity={rim} />
      </g>
    </g>
  );
}

function HoloPhones({ G, uid, light }) {
  const P = G.phones;
  return (
    <>
      <defs><clipPath id={`${uid}-cn`}><path d={P.near.sil} /></clipPath></defs>
      {!light && <path d={P.near.sil} style={{ fill: 'var(--hl)' }} fillOpacity="0.12" />}
      {!light && <path d={P.band.sil} style={{ fill: 'var(--hl)' }} fillOpacity="0.14" />}
      <g clipPath={`url(#${uid}-cn)`} fill="none" style={{ stroke: 'var(--hl)' }}>
        <path d={P.near.sil} strokeWidth={light ? 3 : 3.2} strokeOpacity={light ? 0.6 : 0.3} />
      </g>
      {/* dark paper: the brightest parts carry a soft halo of light */}
      {!light && <path d={`${P.band.rim}${P.near.rim}${P.far.rim}`} fill="none" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.1" style={{ stroke: 'var(--hl)' }} />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--hr)' }}>
        <path d={P.far.rim} strokeWidth="1.1" strokeOpacity="0.9" />
        <path d={P.band.rim} strokeWidth="1.1" strokeOpacity="0.92" />
        <path d={P.near.rim} strokeWidth="1.25" />
        <path d={P.nearFace.rim} strokeWidth="1" strokeOpacity="0.9" />
        <path d={P.nearCap.rim} strokeWidth="0.8" strokeOpacity="0.5" />
      </g>
    </>
  );
}

// the rims of each moving part: reused by the kick chroma and the glitch ghost
function holoRims(G) {
  return {
    body: [G.torso.rim, G.deckArm.rim, G.cueArm.rim],
    head: [G.head.rim, G.phones.band.rim, G.phones.near.rim, G.phones.far.rim, G.cueHand.rim],
    deck: [G.deckHand.rim],
  };
}

function holoScene(G, uid, light, R, clipOk, bare) {
  const bind = k => el => { R.current[k] = el; };
  const id = s => `${uid}-${s}`;
  const C = G.desk;
  const rims = holoRims(G);
  const casing = light ? HOLO_CASING.light : HOLO_CASING.dark, glassA = light ? 0 : 0.22; // light paper: no pale wash over the figure
  // console strokes: every one of them crosses the last content row, so even
  // the lip stays ≤ 0.3, and all of it fades toward the ends (a mask)
  const cA = light ? { faint: 0.16, fine: 0.2, edge: 0.3, lip: 0.3, base: 0.3 } : { faint: 0.12, fine: 0.16, edge: 0.26, lip: 0.3, base: 0.3 };
  const { x0: ex0, x1: ex1, y: ey } = G.emitter, ecx = (ex0 + ex1) / 2;
  // the beam: a narrow cone from the lens up to under the shoulders, cropped to its bounds
  const beamTop = 94, beamX0 = Math.floor(ex0 - 12), beamX1 = Math.ceil(ex1 + 12), beamW = beamX1 - beamX0, beamH = Math.ceil(ey + 5 - beamTop);
  const [dx0, dx1] = C.x, dTop = Math.floor(C.top - 10), dH = HOLO_RIG.h - dTop;
  const dW = HOLO_RIG.w;
  const fadeT = G.box.body[1], fadeB = G.box.body[1] + G.box.body[3];
  const [hx, hy, hw, hh] = G.box.head;
  let ilD = '';
  for (let y = Math.ceil(hy / HOLO_SLICE_PITCH) * HOLO_SLICE_PITCH; y < hy + hh; y += HOLO_SLICE_PITCH) ilD += `M${hx} ${y}h${hw}`;
  // the three moving parts' static drawing; built twice, the second copy
  // (own ids) being the glitch ghost, so nothing is shared across SVGs by <use>
  const parts = pfx => {
    // the torso dissolves into the beam: a vertical mask over the body box
    const bodyFade = (
      <mask id={id(pfx + 'mb')} maskUnits="userSpaceOnUse" x={G.box.body[0] - 4} y={fadeT - 4} width={G.box.body[2] + 8} height={G.box.body[3] + 8}>
        <linearGradient id={id(pfx + 'gb')} gradientUnits="userSpaceOnUse" x1="0" y1="98" x2="0" y2="128">
          <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" />
        </linearGradient>
        <rect x={G.box.body[0] - 4} y={fadeT - 4} width={G.box.body[2] + 8} height={fadeB - fadeT + 8} fill={`url(#${id(pfx + 'gb')})`} />
      </mask>
    );

    const body = (
      <HoloSvg G={G} k="body">
        <defs>{bodyFade}</defs>
        <g mask={`url(#${id(pfx + 'mb')})`}>
          {bare && glassA > 0 && <path d={`${G.torso.sil}${G.deckArm.sil}${G.cueArm.sil}`} fill={casing} fillOpacity={glassA} />}
          <HoloCasing on={bare} light={light} paths={[[G.torso.rim, 0.9], [G.deckArm.rim, 0.95], [G.cueArm.rim, 0.95]]} />
        </g>
        <HoloForm id={id(pfx + 'ct')} part={G.torso} lines={G.torsoLines} light={light} rim={0.5} w={0.9} glow={0.75} lineA={0.2} mask={id(pfx + 'mb')} />
        <HoloForm id={id(pfx + 'cd')} part={G.deckArm} light={light} rim={0.64} w={0.95} glow={0.9} />
        <HoloForm id={id(pfx + 'cc')} part={G.cueArm} light={light} rim={0.7} w={0.95} glow={0.9} />
      </HoloSvg>
    );
    const headSvg = (
      <HoloSvg G={G} k="head">
        {!light && (
          <>
            <defs>
              <radialGradient id={id(pfx + 'ga')} cx={G.aura[0]} cy={G.aura[1]} r={G.aura[2]} gradientUnits="userSpaceOnUse">
                <stop offset="0.35" stopColor="#fff" /><stop offset="1" stopColor="#000" />
              </radialGradient>
              <mask id={id(pfx + 'ma')} maskUnits="userSpaceOnUse" x={G.aura[0] - G.aura[2]} y={G.aura[1] - G.aura[2]} width={G.aura[2] * 2} height={G.aura[2] * 2}>
                <circle cx={G.aura[0]} cy={G.aura[1]} r={G.aura[2]} fill={`url(#${id(pfx + 'ga')})`} />
              </mask>
            </defs>
            <circle cx={G.aura[0]} cy={G.aura[1]} r={G.aura[2]} mask={`url(#${id(pfx + 'ma')})`} style={{ fill: 'var(--hl)' }} fillOpacity="0.085" />
          </>
        )}
        {bare && glassA > 0 && <path d={`${G.head.sil}${G.phones.near.sil}${G.phones.band.sil}${G.cueHand.sil}`} fill={casing} fillOpacity={glassA} />}
        <HoloCasing on={bare} light={light} paths={[[G.head.rim, 1.05], [G.phones.band.rim, 1.1], [G.phones.near.rim, 1.25], [G.phones.far.rim, 1.1], [G.cueHand.rim, 1.15]]} />
        <defs><clipPath id={id(pfx + 'hc')}><path d={G.head.sil} /></clipPath></defs>
        <path d={ilD} clipPath={`url(#${id(pfx + 'hc')})`} fill="none" strokeWidth="1" strokeOpacity={light ? 0.16 : 0.13} style={{ stroke: 'var(--hl)' }} />
        <HoloForm id={id(pfx + 'ch')} part={G.head} lines={G.headLines} light={light} rim={0.82} w={1.05} lineA={0.3} glow={0.8} />
        <HoloPhones G={G} uid={id(pfx)} light={light} />
        <HoloForm id={id(pfx + 'cq')} part={G.cueHand} lines={G.cueHandLines} light={light} rim={1} w={1.15} glow={1.3} lineA={0.5} halo={0.1} />
      </HoloSvg>
    );
    const deckSvg = (
      <HoloSvg G={G} k="deck">
        {bare && glassA > 0 && <path d={G.deckHand.sil} fill={casing} fillOpacity={glassA} />}
        <HoloCasing on={bare} light={light} paths={[[G.deckHand.rim, 1.15]]} />
        <HoloForm id={id(pfx + 'cz')} part={G.deckHand} lines={G.deckHandLines} light={light} rim={1} w={1.15} glow={1.3} lineA={0.55} halo={0.1} />
      </HoloSvg>
    );
    return { body, head: headSvg, deck: deckSvg };
  };
  const P = parts(''), PG = clipOk ? parts('g') : null;
  // rims only, as plain paths (no <use> across SVGs)
  const rimSvg = (k, children) => {
    const [x, y, w, h] = G.box[k];
    return <svg width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>{children}</svg>;
  };
  const chromaPair = (k, dx, a, sw) => (
    <g fill="none" strokeWidth={sw} strokeLinecap="round" strokeOpacity={a}>
      <g style={{ stroke: 'var(--hca)' }} transform={`translate(${-dx} 0)`}>{rims[k].map((d, i) => <path key={i} d={d} />)}</g>
      <g style={{ stroke: 'var(--hcb)' }} transform={`translate(${dx} 0)`}>{rims[k].map((d, i) => <path key={i} d={d} />)}</g>
    </g>
  );
  const ghostPart = k => (
    <div ref={bind(`g-${k}`)} style={holoBoxStyle(G, k)}>
      {PG[k]}
      <div style={{ ...HOLO_ABS, left: 0, top: 0, width: G.box[k][2], height: G.box[k][3] }}>{rimSvg(k, chromaPair(k, 1.3, 0.38, 1))}</div>
    </div>
  );

  return (
    <div ref={bind('rig')} style={{ ...HOLO_ABS, right: 0, bottom: 0, width: HOLO_RIG.w, height: HOLO_RIG.h, transformOrigin: '100% 100%' }}>
      {/* the projection: pool on the deck + a narrow cone, cropped to its own bounds */}
      <div ref={bind('beam')} style={{ ...HOLO_ABS, left: beamX0, top: beamTop, width: beamW, height: beamH, willChange: 'opacity' }}>
        <svg width={beamW} height={beamH} viewBox={`${beamX0} ${beamTop} ${beamW} ${beamH}`} style={{ display: 'block' }}>
          <defs>
            <linearGradient id={id('gc')} gradientUnits="userSpaceOnUse" x1="0" y1={ey} x2="0" y2={beamTop}>
              <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" />
            </linearGradient>
            <mask id={id('mc')} maskUnits="userSpaceOnUse" x={beamX0} y={beamTop} width={beamW} height={beamH}>
              <rect x={beamX0} y={beamTop} width={beamW} height={beamH} fill={`url(#${id('gc')})`} />
            </mask>
            <radialGradient id={id('gp')} cx={ecx} cy={ey} r="15" gradientUnits="userSpaceOnUse" gradientTransform={`translate(0 ${ey}) scale(1 0.3) translate(0 ${-ey})`}>
              <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" />
            </radialGradient>
            <mask id={id('mp')} maskUnits="userSpaceOnUse" x={beamX0} y={ey - 6} width={beamW} height={12}>
              <rect x={beamX0} y={ey - 6} width={beamW} height={12} fill={`url(#${id('gp')})`} />
            </mask>
          </defs>
          {!light && <rect x={beamX0} y={ey - 6} width={beamW} height={12} mask={`url(#${id('mp')})`} style={{ fill: 'var(--hl)' }} fillOpacity="0.32" />}
          <path d={`M${ex0 + 2} ${ey}L${ex1 - 2} ${ey}L${ex1 + 9} ${beamTop}L${ex0 - 9} ${beamTop}Z`} mask={`url(#${id('mc')})`} style={{ fill: 'var(--hl)' }} fillOpacity={light ? 0.1 : 0.18} />
          <path d={`M${ex0 + 2} ${ey}L${ex0 - 9} ${beamTop}M${ex1 - 2} ${ey}L${ex1 + 9} ${beamTop}`} mask={`url(#${id('mc')})`} fill="none" style={{ stroke: 'var(--hr)' }} strokeOpacity={light ? 0.4 : 0.34} strokeWidth="0.8" />
        </svg>
      </div>
      {/* the console: static, fading toward both ends */}
      <svg width={dW} height={dH} viewBox={`0 ${dTop} ${dW} ${dH}`} style={{ ...HOLO_ABS, left: 0, top: dTop }}>
        <defs>
          <linearGradient id={id('gd')} gradientUnits="userSpaceOnUse" x1={dx0} y1="0" x2={dx1} y2="0">
            <stop offset="0" stopColor="#6a6a6a" /><stop offset="0.3" stopColor="#fff" /><stop offset="0.7" stopColor="#fff" /><stop offset="1" stopColor="#6a6a6a" />
          </linearGradient>
          <mask id={id('md')} maskUnits="userSpaceOnUse" x="0" y={dTop} width={dW} height={dH}>
            <rect x="0" y={dTop} width={dW} height={dH} fill={`url(#${id('gd')})`} />
          </mask>
        </defs>
        <g mask={`url(#${id('md')})`}>
          {/* the Settings preview stands the rig on the colour swatches; a
              glass of the paper colour keeps the decks legible there */}
          {bare && <path d={C.glass} fill={light ? HOLO_CASING.light : HOLO_CASING.dark} fillOpacity={light ? 0.36 : 0.5} />}
          <HoloCasing on={bare} light={light} paths={[[C.edge, 0.75]]} />
          <g fill="none" strokeLinejoin="round" style={{ stroke: 'var(--hl)' }}>
            <path d={C.faint} strokeWidth="0.7" strokeOpacity={cA.faint} />
            <path d={C.fine} strokeWidth="0.6" strokeOpacity={cA.fine} />
            <path d={`${C.edge}${C.face}`} strokeWidth="0.75" strokeOpacity={cA.edge} style={light ? undefined : { stroke: 'var(--hr)' }} />
          </g>
          <g fill="none" style={{ stroke: 'var(--hr)' }}>
            <path d={C.lip} strokeWidth="0.9" strokeOpacity={cA.lip} />
            {!bare && <path d={C.base} strokeWidth="1.1" strokeOpacity={cA.base} />}
          </g>
        </g>
        <path d={C.emitter} style={{ fill: 'var(--hl)', stroke: 'var(--hr)' }} fillOpacity={light ? 0.14 : 0.22} strokeWidth="0.7" strokeOpacity="0.8" />
        <circle cx={C.lens[0]} cy={C.lens[1]} r="1.2" style={{ fill: 'var(--hr)' }} />
        <g style={{ fill: 'var(--hl)' }} fillOpacity={light ? 0.26 : 0.2}>{G.vu.flat().map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="0.8" />)}</g>
        {/* live: the VU, a precomputed path swapped on a 16th */}
        <path ref={bind('vu')} d="" style={{ fill: 'var(--hr)' }} />
      </svg>
      {G.jogs.map((j, i) => (
        <div key={i} style={{ ...HOLO_ABS, left: j.cx, top: j.cy, width: 0, height: 0, transform: `scale(1, ${(j.ry / j.rx).toFixed(4)})` }}>
          <div ref={bind(`jog${i}`)} style={{ ...HOLO_ABS, left: 0, top: -0.5, width: j.rx - 2, height: 1, transformOrigin: '0 50%', willChange: 'transform',
            background: 'linear-gradient(90deg, transparent, var(--hr) 50%, var(--hr))', opacity: 0.45 }} />
        </div>
      ))}
      {/* the figure */}
      <div ref={bind('fig')} style={{ ...HOLO_ABS, left: 0, top: 0, width: HOLO_RIG.w, height: HOLO_RIG.h }}>
        <div ref={bind('body')} style={holoBoxStyle(G, 'body', { willChange: 'transform, opacity' })}>
          {P.body}
          {clipOk && (
            <div style={{ ...HOLO_ABS, left: 0, top: 0, width: G.box.body[2], height: G.box.body[3], clipPath: G.sliceClip.body, WebkitMaskImage: 'linear-gradient(#000 55%, transparent 88%)', maskImage: 'linear-gradient(#000 55%, transparent 88%)' }}>
              <div ref={bind('slices')} style={{
                ...HOLO_ABS, left: 0, top: 0, width: G.box.body[2], height: G.box.body[3] + HOLO_SLICE_PITCH * 2, willChange: 'transform', opacity: light ? 0.1 : 0.085,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--hl) 0px, var(--hl) 1px, transparent 1px, transparent ${HOLO_SLICE_PITCH}px)`,
              }} />
            </div>
          )}
        </div>
        <div ref={bind('deck')} style={holoBoxStyle(G, 'deck', { willChange: 'transform, opacity' })}>
          {P.deck}
        </div>
        <div ref={bind('head')} style={holoBoxStyle(G, 'head', { willChange: 'transform, opacity' })}>
          {P.head}
          <div ref={bind('chroma')} style={{ ...HOLO_ABS, left: 0, top: 0, width: G.box.head[2], height: G.box.head[3], opacity: 0, willChange: 'opacity' }}>
            {rimSvg('head', chromaPair('head', 1.1, 1, light ? 1 : 1.1))}
          </div>
        </div>
      </div>
      {/* glitch: one displaced band of the figure (a second copy, its own ids), shown only during a burst */}
      {clipOk && (
        <div ref={bind('glitch')} style={{ ...HOLO_ABS, left: G.figX[0], top: 0, width: G.figX[1] - G.figX[0], height: 0, overflow: 'hidden', display: 'none' }}>
          <div ref={bind('glitchIn')} style={{ ...HOLO_ABS, left: -G.figX[0], top: 0, width: HOLO_RIG.w, height: HOLO_RIG.h, opacity: 0.7 }}>
            {ghostPart('body')}
            {ghostPart('deck')}
            {ghostPart('head')}
          </div>
        </div>
      )}
    </div>
  );
}

// precomputed VU path per level (0..7 lit dots per column)
let holoVuD = null;
function holoVuPaths(G) {
  if (!holoVuD) holoVuD = Array.from({ length: 8 }, (_, lit) => G.vu.map(col => col.slice(0, lit).map(p => `M${(p[0] - 0.95).toFixed(1)} ${p[1].toFixed(1)}a0.95 0.95 0 1 0 1.9 0a0.95 0.95 0 1 0 -1.9 0`).join('')).join(''));
  return holoVuD;
}

export function RadioHologramDJ({ enabled = true, color = '#0ac5a8', isLight = false, floor = 64, preview = false }) {
  const uid = React.useId().replace(/[^A-Za-z0-9_-]/g, '');
  const R = React.useRef({});
  const root = React.useRef(null);
  const tint = React.useRef(color);
  tint.current = color;
  // one clock for the whole mount (a paper switch re-runs the effect; the beat must not restart)
  const t0 = React.useRef(null);
  if (t0.current === null) t0.current = performance.now();
  const light = !!isLight;
  const G = React.useMemo(() => holoGeometry(), []);
  const clipOk = React.useMemo(() => holoClipPathOk(), []);
  // the palette at mount / paper change; later updates are imperative
  const style0 = React.useMemo(() => {
    const p = holoPalette(holoNormTint(tint.current), light);
    return { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'hidden', '--hr': p.rim, '--hl': p.line, '--hca': p.ca, '--hcb': p.cb };
  }, [light]);
  // bare = the Settings preview's treatment (casing, glass, 1.15x). It is NOT
  // implied by floor 0: the calendar and cycle screens have no tab bar either,
  // and they keep the plain rig over their content for as long as radio plays.
  const fl = Math.max(0, +floor || 0), bare = !!preview;
  const scene = React.useMemo(() => holoScene(G, uid, light, R, clipOk, bare), [G, uid, light, clipOk, bare]);
  // with no tab bar the rig stands on the surface's own bottom edge: inset it
  // so the base clears the phone's rounded corner
  const stage = React.useMemo(() => ({ position: 'absolute', left: 0, top: 0, right: fl > 0 ? HOLO_RIG.right : HOLO_RIG.right + HOLO_RIG.corner, bottom: fl }), [fl]);

  React.useLayoutEffect(() => {
    if (!enabled) return undefined;
    const r = R.current, el = root.current;
    if (!el) return undefined;
    const still = holoReduced();
    let raf = 0, palAt = -1e9, palKey = '', lastSix = -1, lastVu = -1, lastJog = -1, glitchOn = null;
    const memo = new Map();
    const put = (node, k, v) => { if (!node) return; let m = memo.get(node); if (!m) memo.set(node, m = {}); if (m[k] !== v) { m[k] = v; node.style[k] = v; } };
    const vuD = holoVuPaths(G);
    const [bx, by] = G.pivot.body, [hx, hy] = G.pivot.head, [wx, wy] = G.pivot.deck;
    const frame = now => {
      // reduced motion: one still pose (the loop only follows the tint)
      const real = Math.max(0, now - t0.current);
      const ms = still ? 0.62 * HOLO_BEAT_MS : real;
      const b = holoBeat(ms);
      // palette: sampled at ≤3.3 Hz; the reach is continuous, so a drifting tint moves a few levels a step
      if (real - palAt >= HOLO_PAL_MS || real < palAt) {
        palAt = real;
        const key = holoNormTint(tint.current);
        if (key !== palKey) {
          palKey = key;
          const p = holoPalette(key, light);
          el.style.setProperty('--hr', p.rim); el.style.setProperty('--hl', p.line);
        }
      }
      // motion: bob + shoulder roll on the kick, a slow sway (≤0.7°), head nod, scratch rock on 8ths
      const kick = b.pulse;
      const bob = 1.1 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (b.phase - 0.06)));
      const sway = 0.7 * Math.sin(2 * Math.PI * b.bar);
      const roll = -0.9 * kick;
      const nod = -3.4 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (b.phase - 0.12)));
      const scratch = 7 * Math.sin(Math.PI * b.eighths);
      const g = still ? null : holoGlitchAt(ms);
      const jolt = g ? (g.dx > 0 ? 0.6 : -0.6) : 0;
      const a = ((sway + roll) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const bodyT = `translate(${jolt.toFixed(2)}px,${bob.toFixed(2)}px) rotate(${(sway + roll).toFixed(2)}deg)`;
      put(r.body, 'transform', bodyT);
      // the head rides the body (about the same waist pivot) and nods about the neck
      const hpx = bx + (hx - bx) * ca - (hy - by) * sa - hx + jolt, hpy = by + (hx - bx) * sa + (hy - by) * ca - hy + bob;
      const headT = `translate(${hpx.toFixed(2)}px,${hpy.toFixed(2)}px) rotate(${(nod + sway + roll).toFixed(2)}deg)`;
      put(r.head, 'transform', headT);
      // the deck hand follows the arm's wrist under the body's transform, and rocks about it
      const wdx = bx + (wx - bx) * ca - (wy - by) * sa - wx + jolt, wdy = by + (wx - bx) * sa + (wy - by) * ca - wy + bob;
      const deckT = `translate(${wdx.toFixed(2)}px,${wdy.toFixed(2)}px) rotate(${scratch.toFixed(2)}deg)`;
      put(r.deck, 'transform', deckT);
      // secondary channels, quantised so they are written only when they move:
      // a slow ~9 Hz shimmer, beam and chroma in 0.02 steps, slices in 0.5 px steps
      const kq = Math.round(kick * 8) / 8;
      const o = HOLO_Q[Math.round(100 * (0.9 + 0.06 * kq) * (0.965 + 0.035 * holoHash(Math.floor(ms / 110))) * (g ? 0.85 : 1))];
      put(r.body, 'opacity', o); put(r.head, 'opacity', o); put(r.deck, 'opacity', o);
      put(r.chroma, 'opacity', HOLO_Q[2 * Math.round((light ? 18 : 20) * kick * kick)]);
      put(r.slices, 'transform', HOLO_SLICE_Y[Math.round(((ms * 0.005) % HOLO_SLICE_PITCH) * 2)]);
      put(r.beam, 'opacity', HOLO_Q[2 * Math.round((0.72 + 0.28 * kick) * 50)]);
      const jq = Math.floor(ms / HOLO_JOG_MS);
      if (jq !== lastJog) {
        lastJog = jq;
        const tq = jq * HOLO_JOG_MS;
        put(r.jog0, 'transform', `rotate(${((-150 + 3.2 * 7 * Math.sin((Math.PI * tq) / (HOLO_BEAT_MS / 2)) + tq * 0.012) % 360).toFixed(0)}deg)`);
        put(r.jog1, 'transform', `rotate(${((tq * 0.2) % 360).toFixed(0)}deg)`);
      }
      // VU: per 16th
      if (b.sixteenthN !== lastSix) {
        lastSix = b.sixteenthN;
        const s = b.sixteenthN % 4, lvl = Math.max(1, Math.min(7, Math.round(7 * (0.25 + 0.72 * (1 - s / 4) ** 2) * (0.85 + 0.15 * holoHash(b.sixteenthN)))));
        if (lvl !== lastVu && r.vu) { lastVu = lvl; r.vu.setAttribute('d', vuD[lvl]); }
      }
      // glitch: cut one band out of the figure and show that band's rims displaced,
      // with the chroma split inside it only; set once per burst, display:none otherwise
      if (g && glitchOn !== g.n && r.glitch) {
        glitchOn = g.n;
        const [x0, x1] = G.figX;
        if (r.fig) r.fig.style.clipPath = `path(evenodd, 'M0 -60H${HOLO_RIG.w}V${HOLO_RIG.h}H0Z M${x0} ${g.y}H${x1}V${g.y + g.h}H${x0}Z')`;
        r.glitch.style.top = `${g.y}px`; r.glitch.style.height = `${g.h}px`; r.glitch.style.display = 'block';
        if (r.glitchIn) r.glitchIn.style.transform = `translate(${g.dx}px,${-g.y}px)`;
        if (r['g-body']) r['g-body'].style.transform = bodyT;
        if (r['g-head']) r['g-head'].style.transform = headT;
        if (r['g-deck']) r['g-deck'].style.transform = deckT;
      } else if (!g && glitchOn !== null) {
        glitchOn = null;
        if (r.fig) r.fig.style.clipPath = '';
        if (r.glitch) r.glitch.style.display = 'none';
      }
      raf = requestAnimationFrame(frame);
    };
    let ro;
    const fit = w => { const k = Math.max(0.86, Math.min(1.25, w / HOLO_RIG.ref)) * (bare ? HOLO_RIG.bareScale : 1); if (r.rig) r.rig.style.transform = `scale(${k.toFixed(3)})`; };
    fit(el.clientWidth || HOLO_RIG.ref);
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(([e]) => fit(e.contentRect.width)); ro.observe(el); }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      // React never owns these two: put them back so a re-run cannot inherit a burst
      if (r.fig) r.fig.style.clipPath = '';
      if (r.glitch) r.glitch.style.display = 'none';
    };
  }, [enabled, scene, light, G, bare]);

  if (!enabled) return null;
  return (
    <div ref={root} aria-hidden="true" style={style0}>
      <div style={stage}>{scene}</div>
    </div>
  );
}
