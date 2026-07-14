import React from 'react';
import { bsSwipeIntent } from '../services/swipeIntent.mjs';
// iosAppBroadsheet.jsx — Shared tokens, primitives, theme context for the
// Broadsheet redesign of the Shape iOS app.
//
// Reads tweak state from a TweakContext so light/dark, accent, density, weight,
// and border style can flow through the whole app from one Tweaks panel.
//
// Type system:
//   DISPLAY_BS = Saira (headers, mastheads, section labels — the wordmark face; Space Grotesk fallback)
//   BODY_BS    = native system stack (body copy, controls, rows)
//   MONO_BS    = JetBrains Mono (eyebrows, times, tags)
//   No serifs. No script. This is the contract.

const {
  useState: useStateBS,
  useContext: useContextBS,
  useEffect: useEffectBS,
  useRef: useRefBS,
  createContext: createContextBS,
} = React;

// ─── Type stacks ───────────────────────────────────────────
const DISPLAY_BS = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
const BODY_BS    = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_BS    = "'JetBrains Mono', ui-monospace, monospace";


// ─── Theme palette generator ───────────────────────────────
// "paper" mode swaps cream<->near-black; everything derives from it.
// Convert "#rgb" / "#rrggbb" → "r,g,b" string for use in rgba()
function _hexToRGB(h) {
  if (!h || typeof h !== 'string') return null;
  let s = h.trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6 || /[^0-9a-f]/i.test(s)) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

// WCAG-ish relative luminance + contrast ratio over "r,g,b" strings — used to
// guard saved customizations (ink override / black-white accents) so no combo
// can render unreadable text on the chosen paper.
function _relLum(rgbStr) {
  const [r, g, b] = rgbStr.split(',').map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function _contrast(rgbA, rgbB) {
  const a = _relLum(rgbA), b = _relLum(rgbB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function makePalette({ paperMode = 'dark', accentKey = 'blue', inkOverride = null } = {}) {
  // Six paper modes — light/dark are the originals; teal/manila/blueprint/carbon
  // are tuned colored stocks. Each picks PAPER (base), PAPER2 (raised surface),
  // PAPER3 (pressed/active), INK (text), and the rgb tuple used for alpha rules.
  // Manila is light-on-tan (isLight-shaped); the others are dark-on-color.
  const PAPERS = {
    light:     { paper: '#f5f0e6', paper2: '#ede6d6', paper3: '#e3dac4', ink: '#0f0e0c', inkRGB: '15,14,12',    light: true  },
    white:     { paper: '#ffffff', paper2: '#f4f4f5', paper3: '#e8e8ea', ink: '#0f0f10', inkRGB: '15,15,16',    light: true  },
    dark:      { paper: '#0f0e0c', paper2: '#181612', paper3: '#221d18', ink: '#f5f0e6', inkRGB: '245,240,230', light: false },
    teal:      { paper: '#063d34', paper2: '#0a4f43', paper3: '#106456', ink: '#f1ece0', inkRGB: '241,236,224', light: false },
    manila:    { paper: '#d9c089', paper2: '#cfb47a', paper3: '#c2a466', ink: '#221806', inkRGB: '34,24,6',     light: true  },
    blueprint: { paper: '#0a2a52', paper2: '#0f3461', paper3: '#163f72', ink: '#dbe7ff', inkRGB: '219,231,255', light: false },
    carbon:    { paper: '#000000', paper2: '#1c1f24', paper3: '#2a2e35', ink: '#c9cfd6', inkRGB: '201,207,214', light: false },
    steel:     { paper: '#c2c7cd', paper2: '#b4b9bf', paper3: '#a3a9b0', ink: '#15181c', inkRGB: '21,24,28',    light: true,  metallic: true },
    bone:      { paper: '#ece4d3', paper2: '#e2d8c2', paper3: '#d4c8ad', ink: '#1a160e', inkRGB: '26,22,14',    light: true  },
    oxblood:   { paper: '#3a1418', paper2: '#481a1f', paper3: '#5a2128', ink: '#f0dfd2', inkRGB: '240,223,210', light: false },
    sage:      { paper: '#d4d9c6', paper2: '#c8cdb6', paper3: '#b7bda3', ink: '#1b2015', inkRGB: '27,32,21',    light: true  },
    forest:    { paper: '#0f231a', paper2: '#163021', paper3: '#1e3d2a', ink: '#e3efe2', inkRGB: '227,239,226', light: false },
    slate:     { paper: '#212834', paper2: '#2b3340', paper3: '#36404e', ink: '#dce4ef', inkRGB: '220,228,239', light: false },
    plum:      { paper: '#251630', paper2: '#311e40', paper3: '#3e2752', ink: '#ebdff2', inkRGB: '235,223,242', light: false },
    rose:      { paper: '#ead9d7', paper2: '#e1cbc8', paper3: '#d4b8b4', ink: '#241014', inkRGB: '36,16,20',    light: true  },
    mist:      { paper: '#dde4e9', paper2: '#d1dae1', paper3: '#c1ccd5', ink: '#121a20', inkRGB: '18,26,32',    light: true  },
    cocoa:     { paper: '#241812', paper2: '#2e2018', paper3: '#3a2a20', ink: '#efe2d3', inkRGB: '239,226,211', light: false },
    midnight:  { paper: '#0e1226', paper2: '#151a33', paper3: '#1d2342', ink: '#e3e7f7', inkRGB: '227,231,247', light: false },
  };
  const P = PAPERS[paperMode] || PAPERS.dark;
  const isLight = P.light;
  const PAPER  = P.paper;
  const PAPER2 = P.paper2;
  const PAPER3 = P.paper3;
  // Optional ink override — user-chosen text/foreground color from Tweaks.
  // Applied only when it parses cleanly AND actually reads on this paper
  // (contrast ≥ 3) — a saved dark override on the Black paper (or light on
  // white) silently falls back to the paper's own ink instead of going blind.
  const _paperRGB = _hexToRGB(PAPER);
  let _override = inkOverride && inkOverride !== 'default' ? _hexToRGB(inkOverride) : null;
  if (_override && _paperRGB && _contrast(_override, _paperRGB) < 3) _override = null;
  const INK    = _override ? inkOverride : P.ink;
  const inkRGB = _override || P.inkRGB;
  const INK85  = `rgba(${inkRGB},0.85)`;
  const INK70  = `rgba(${inkRGB},0.70)`;
  const INK50  = `rgba(${inkRGB},0.50)`;
  const INK30  = `rgba(${inkRGB},0.28)`;
  const RULE   = `rgba(${inkRGB},${isLight ? 0.18 : 0.20})`;
  const HAIR   = `rgba(${inkRGB},${isLight ? 0.08 : 0.10})`;

  // PAPER_BG — full CSS background string. Equal to PAPER for flat papers;
  // for Steel, paints a brushed-metal sheen (vertical brush lines + horizontal
  // highlight band) so the surface reads as cool metal instead of flat gray.
  let PAPER_BG = PAPER;
  if (P.metallic) {
    PAPER_BG = `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 24%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0.18) 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, rgba(0,0,0,0.025) 1px, rgba(0,0,0,0.025) 2px), ${PAPER}`;
  }

  // Accent palette — slightly different hex pairs in light vs dark for contrast
  const accents = {
    blue:  { light: '#1c4ed8', dark: '#5b8df9' },
    amber: { light: '#c8881a', dark: '#e3a544' },
    rust:  { light: '#a8331b', dark: '#e06547' },
    green: { light: '#2f6b3a', dark: '#5fb16e' },
    teal:  { light: '#0a8f87', dark: '#34d6c5' },
    violet:{ light: '#6d3fc4', dark: '#a78bfa' },
    rose:  { light: '#b8285f', dark: '#f2749f' },
    white: { light: '#ffffff', dark: '#ffffff' },
    black: { light: '#000000', dark: '#000000' },
  };
  let ACCENT = accents[accentKey] ? accents[accentKey][isLight ? 'light' : 'dark'] : accents.blue.light;
  // The mono accents (black/white) are one hex for both modes — on a paper of
  // the same tone they vanish. Keep the mono intent but flip to the readable side.
  {
    const _accRGB = _hexToRGB(ACCENT);
    if (_accRGB && _paperRGB && _contrast(_accRGB, _paperRGB) < 1.6) ACCENT = isLight ? '#000000' : '#ffffff';
  }

  // Companion accents (always available regardless of "primary" choice)
  const BLUE  = accents.blue [isLight ? 'light' : 'dark'];
  const AMBER = accents.amber[isLight ? 'light' : 'dark'];
  const RUST  = accents.rust [isLight ? 'light' : 'dark'];
  const GREEN = accents.green[isLight ? 'light' : 'dark'];
  const surfaceAlpha = isLight ? 0.045 : 0.055;
  const surfaceStrongAlpha = isLight ? 0.075 : 0.085;
  const surfaceBorderAlpha = isLight ? 0.12 : 0.14;
  const shadowColor = isLight ? 'rgba(15,14,12,0.10)' : 'rgba(0,0,0,0.28)';

  return {
    isLight, paperMode, accentKey, inkRGB,
    PAPER, PAPER2, PAPER3, PAPER_BG, INK, INK85, INK70, INK50, INK30, RULE, HAIR,
    ACCENT, BLUE, AMBER, RUST, GREEN,
    SURFACE: `rgba(${inkRGB},${surfaceAlpha})`,
    SURFACE_STRONG: `rgba(${inkRGB},${surfaceStrongAlpha})`,
    SURFACE_BORDER: `rgba(${inkRGB},${surfaceBorderAlpha})`,
    ELEVATION: `0 18px 42px ${shadowColor}`,
    ELEVATION_SOFT: `0 10px 24px ${shadowColor}`,
    GLASS: isLight ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.045)',
    // ─── Rounded-edge tokens (medium softening, still editorial) ───
    RADIUS: 14,    // primary card/cell/sheet radius
    RADIUS_SM: 10, // inner inputs, small chips, beakers
    RADIUS_LG: 22, // large surfaces
  };
}

// ─── Density tokens ────────────────────────────────────────
function makeDensity(densityKey = 'standard') {
  const map = {
    relaxed:  { padX: 26, rowY: 14, sectGap: 28, headlineHero: 92, headlineLead: 44, body: 16 },
    standard: { padX: 22, rowY: 11, sectGap: 22, headlineHero: 84, headlineLead: 38, body: 15 },
    dense:    { padX: 18, rowY: 8,  sectGap: 16, headlineHero: 74, headlineLead: 32, body: 14 },
  };
  return map[densityKey] || map.standard;
}

// ─── Border style ──────────────────────────────────────────
function makeBorders(borderKey = 'hairlines', P) {
  const map = {
    hairlines:  { thin: `1px solid ${P.HAIR}`, rule: `1px solid ${P.RULE}`, slab: `1px solid ${P.INK}` },
    'thick rules': { thin: `1px solid ${P.RULE}`, rule: `2px solid ${P.INK}`, slab: `3px solid ${P.INK}` },
    'no rules': { thin: 'none', rule: 'none', slab: 'none' },
  };
  return map[borderKey] || map.hairlines;
}

// ─── Texture / pattern overlay ─────────────────────────────
// Returns a CSS background string layered ABOVE the page color.
// All textures use the ink RGB tuple so they tint correctly on any paper.
function makeTexture(textureKey = 'none', inkRGB = '15,14,12', isLight = true) {
  const a = (n) => `rgba(${inkRGB},${n})`;
  switch (textureKey) {
    case 'newsprint':
      // dual-frequency dot field — fake halftone grain
      return `radial-gradient(${a(isLight ? 0.14 : 0.18)} 0.7px, transparent 0.9px) 0 0/3px 3px,
              radial-gradient(${a(isLight ? 0.10 : 0.14)} 0.7px, transparent 0.9px) 1px 1px/5px 5px`;
    case 'ledger':
      // horizontal rule lines every 28px
      return `repeating-linear-gradient(180deg, transparent 0 27px, ${a(isLight ? 0.22 : 0.26)} 27px 28px)`;
    case 'grid':
      // engineer grid — major every 40px, minor every 8px
      return `repeating-linear-gradient(0deg,   ${a(isLight ? 0.14 : 0.20)} 0 1px, transparent 1px 40px),
              repeating-linear-gradient(90deg,  ${a(isLight ? 0.14 : 0.20)} 0 1px, transparent 1px 40px),
              repeating-linear-gradient(0deg,   ${a(isLight ? 0.06 : 0.09)} 0 1px, transparent 1px 8px),
              repeating-linear-gradient(90deg,  ${a(isLight ? 0.06 : 0.09)} 0 1px, transparent 1px 8px)`;
    case 'dotgrid':
      return `radial-gradient(${a(isLight ? 0.32 : 0.38)} 1.2px, transparent 1.6px) 0 0/16px 16px`;
    case 'foxed':
      // uneven aging spots — multiple offset radial gradients
      return `radial-gradient(ellipse 180px 140px at 18% 12%,  ${a(0.14)}, transparent 60%),
              radial-gradient(ellipse 120px 160px at 82% 28%,  ${a(0.12)}, transparent 60%),
              radial-gradient(ellipse 200px 120px at 30% 78%,  ${a(0.10)}, transparent 60%),
              radial-gradient(ellipse 140px 140px at 88% 92%,  ${a(0.14)}, transparent 60%),
              radial-gradient(ellipse 90px 90px  at 60% 50%,   ${a(0.08)}, transparent 60%)`;
    case 'vignette':
      return `radial-gradient(ellipse 110% 85% at 50% 50%, transparent 40%, ${a(isLight ? 0.28 : 0.40)} 100%)`;
    case 'watermark': {
      // Repeating diagonal SHAPE wordmark, very faint — heavy sans (the closest
      // system face to the Saira wordmark; data-URI SVG can't reach bundled fonts)
      const op = isLight ? 0.09 : 0.13;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'><g transform='rotate(-22 160 160)' fill='rgba(${inkRGB},${op})' font-family='Arial Black,Helvetica Neue,sans-serif' font-weight='900' font-size='48' letter-spacing='6' text-anchor='middle'><text x='160' y='176'>SHAPE</text></g></svg>`;
      const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
      return `${url} 0 0/320px 320px`;
    }
    case 'linen':
      // Subtle woven-fabric crosshatch — perpendicular hairlines at 2px pitch
      return `repeating-linear-gradient(0deg,  ${a(isLight ? 0.05 : 0.07)} 0 1px, transparent 1px 2px),
              repeating-linear-gradient(90deg, ${a(isLight ? 0.05 : 0.07)} 0 1px, transparent 1px 2px),
              radial-gradient(${a(isLight ? 0.04 : 0.06)} 0.5px, transparent 0.8px) 0 0/4px 4px`;
    case 'crosshatch':
      // Etching-style diagonal hatch, both directions
      return `repeating-linear-gradient(45deg,  ${a(isLight ? 0.10 : 0.14)} 0 1px, transparent 1px 6px),
              repeating-linear-gradient(-45deg, ${a(isLight ? 0.08 : 0.12)} 0 1px, transparent 1px 6px)`;
    case 'pinstripe':
      // Tailoring pinstripe — narrow vertical lines
      return `repeating-linear-gradient(90deg, ${a(isLight ? 0.16 : 0.20)} 0 1px, transparent 1px 6px)`;
    case 'halftone':
      // Big halftone dots, classic comic / risograph
      return `radial-gradient(${a(isLight ? 0.28 : 0.34)} 1.6px, transparent 2.0px) 0 0/9px 9px,
              radial-gradient(${a(isLight ? 0.18 : 0.24)} 1.2px, transparent 1.6px) 4.5px 4.5px/9px 9px`;
    case 'kraft':
      // Brown-paper fibre — irregular small specks
      return `radial-gradient(${a(isLight ? 0.18 : 0.22)} 0.6px, transparent 1px) 0 0/7px 7px,
              radial-gradient(${a(isLight ? 0.10 : 0.14)} 0.6px, transparent 1px) 3px 5px/11px 11px,
              radial-gradient(${a(isLight ? 0.06 : 0.09)} 0.4px, transparent 0.8px) 6px 2px/13px 9px`;
    case 'blueprint': {
      // Cyan blueprint: tinted page wash + fine grid
      const cyan = isLight ? 'rgba(40,90,140,0.06)' : 'rgba(120,180,220,0.10)';
      const cyanLine = isLight ? 'rgba(40,90,140,0.18)' : 'rgba(140,200,240,0.22)';
      return `${cyan},
              repeating-linear-gradient(0deg,  ${cyanLine} 0 1px, transparent 1px 24px),
              repeating-linear-gradient(90deg, ${cyanLine} 0 1px, transparent 1px 24px)`;
    }
    case 'graph': {
      // Engineering graph paper — minor 6px, major 30px, slight green-blue
      const minor = isLight ? 'rgba(40,80,140,0.06)' : 'rgba(120,170,220,0.08)';
      const major = isLight ? 'rgba(40,80,140,0.16)' : 'rgba(120,170,220,0.20)';
      return `repeating-linear-gradient(0deg,  ${major} 0 1px, transparent 1px 30px),
              repeating-linear-gradient(90deg, ${major} 0 1px, transparent 1px 30px),
              repeating-linear-gradient(0deg,  ${minor} 0 1px, transparent 1px 6px),
              repeating-linear-gradient(90deg, ${minor} 0 1px, transparent 1px 6px)`;
    }
    case 'stains':
      // Coffee-ring + ink-bleed marks scattered
      return `radial-gradient(circle 60px at 14% 22%, transparent 38px, ${a(isLight ? 0.14 : 0.16)} 39px, ${a(isLight ? 0.10 : 0.12)} 41px, transparent 46px),
              radial-gradient(circle 90px at 78% 64%, transparent 60px, ${a(isLight ? 0.10 : 0.12)} 61px, transparent 70px),
              radial-gradient(ellipse 80px 60px at 52% 88%, ${a(isLight ? 0.12 : 0.14)}, transparent 70%),
              radial-gradient(ellipse 50px 40px at 88% 12%, ${a(isLight ? 0.10 : 0.12)}, transparent 70%)`;
    case 'cardboard':
      // Corrugated cardboard — wider horizontal banding + fibre flecks
      return `repeating-linear-gradient(180deg, transparent 0 11px, ${a(isLight ? 0.12 : 0.14)} 11px 12px, transparent 12px 22px, ${a(isLight ? 0.06 : 0.08)} 22px 23px),
              radial-gradient(${a(isLight ? 0.10 : 0.12)} 0.5px, transparent 0.9px) 0 0/8px 8px`;
    case 'concrete': {
      // Mid-grey concrete wash — stippled stains + fine grain
      const cool = isLight ? 'rgba(60,60,68,0.06)' : 'rgba(180,180,190,0.06)';
      return `${cool},
              radial-gradient(${a(isLight ? 0.10 : 0.14)} 0.7px, transparent 1.1px) 0 0/5px 5px,
              radial-gradient(ellipse 140px 100px at 22% 30%, ${a(isLight ? 0.10 : 0.12)}, transparent 70%),
              radial-gradient(ellipse 180px 120px at 78% 72%, ${a(isLight ? 0.08 : 0.10)}, transparent 70%)`;
    }
    case 'risograph': {
      // Two-colour riso misregistration — magenta + cyan halftone offset
      const mag = isLight ? 'rgba(220,60,120,0.18)' : 'rgba(255,120,170,0.22)';
      const cy  = isLight ? 'rgba(40,140,200,0.18)' : 'rgba(120,200,240,0.22)';
      return `radial-gradient(${mag} 1.0px, transparent 1.4px) 0 0/8px 8px,
              radial-gradient(${cy}  1.0px, transparent 1.4px) 4px 4px/8px 8px`;
    }
    case 'parchment': {
      // Warm parchment — uneven gold/brown tints + age marks
      const warm = isLight ? 'rgba(180,140,80,0.08)' : 'rgba(220,180,120,0.10)';
      return `radial-gradient(ellipse 220px 160px at 14% 18%, ${warm}, transparent 70%),
              radial-gradient(ellipse 260px 180px at 84% 76%, ${warm}, transparent 70%),
              radial-gradient(ellipse 60px 50px at 40% 82%, ${a(0.10)}, transparent 70%),
              radial-gradient(${a(isLight ? 0.06 : 0.08)} 0.5px, transparent 0.9px) 0 0/6px 6px`;
    }
    case 'dotmap': {
      // Stippled topographic / dot-map — variable density radial
      return `radial-gradient(${a(isLight ? 0.22 : 0.28)} 1.2px, transparent 1.6px) 0 0/14px 14px,
              radial-gradient(${a(isLight ? 0.16 : 0.20)} 0.9px, transparent 1.3px) 7px 7px/14px 14px,
              radial-gradient(ellipse 200px 140px at 30% 30%, ${a(0.06)}, transparent 70%),
              radial-gradient(ellipse 200px 140px at 70% 70%, ${a(0.06)}, transparent 70%)`;
    }
    case 'contour':
      // Topographic contour rings — two offset ring fields (the Terrain language)
      return `repeating-radial-gradient(circle at 22% 18%, transparent 0 21px, ${a(isLight ? 0.10 : 0.14)} 21px 22px),
              repeating-radial-gradient(circle at 78% 72%, transparent 0 27px, ${a(isLight ? 0.08 : 0.11)} 27px 28px)`;
    case 'checker':
      // Quiet checkerboard — alternating ink-alpha squares
      return `repeating-conic-gradient(${a(isLight ? 0.05 : 0.07)} 0% 25%, transparent 0% 50%) 0 0/32px 32px`;
    case 'sunburst':
      // Deco sunburst — rays fanning down from above the masthead
      return `repeating-conic-gradient(from 0deg at 50% -12%, ${a(isLight ? 0.07 : 0.10)} 0deg 5deg, transparent 5deg 11deg)`;
    case 'scales':
      // Fish-scale scallop — two half-offset arc rows
      return `radial-gradient(circle at 50% 0, transparent 12px, ${a(isLight ? 0.12 : 0.16)} 12.5px 13.5px, transparent 14.5px) 0 0/26px 26px,
              radial-gradient(circle at 50% 0, transparent 12px, ${a(isLight ? 0.12 : 0.16)} 12.5px 13.5px, transparent 14.5px) 13px 13px/26px 26px`;
    case 'none':
    default:
      return null;
  }
}

// ─── Display weight ────────────────────────────────────────
// Saira (the display face since #1713) is a variable font and reads heavier
// than Space Grotesk did at the same number — the default "bold" tier thins
// to 600/650 (owner call 2026-07-13: "thin out the header font").
function makeWeights(weightKey = 'bold') {
  return weightKey === 'regular'
    ? { display: 300, displayHeavy: 400, eyebrow: 400 }
    : { display: 600, displayHeavy: 650, eyebrow: 600 };
}

// ─── Theme context ─────────────────────────────────────────
// ── Units (Imperial / Metric) ──────────────────────────────────────────────
// Single reactive source of truth for the user's unit preference. Settings
// persists it to user_goals (client_settings.units) and loads it at startup;
// we cache it here so any component reading the theme (useBS) gets formatters
// that re-render the moment it flips. Stored/native values are Imperial
// (pounds, miles) — the historical default — and converted on display.
const BS_UNIT_LISTENERS = new Set();
let bsUnitSystem = 'imperial';
const LB_TO_KG = 0.45359237;
const MI_TO_KM = 1.609344;
function bsNormalizeUnits(v) {
  return /metric|\bkg\b|\bkm\b/i.test(String(v == null ? '' : v)) ? 'metric' : 'imperial';
}
function bsSetUnits(v) {
  const next = bsNormalizeUnits(v);
  if (next === bsUnitSystem) return;
  bsUnitSystem = next;
  BS_UNIT_LISTENERS.forEach((fn) => { try { fn(next); } catch (e) {} });
}
const ShapeUnits = {
  get: () => bsUnitSystem,
  set: bsSetUnits,
  subscribe: (fn) => { BS_UNIT_LISTENERS.add(fn); return () => BS_UNIT_LISTENERS.delete(fn); },
};
function bsUnitFormatters(system) {
  const metric = system === 'metric';
  const num = (n, d) => {
    const f = Math.pow(10, d);
    const r = Math.round(n * f) / f;
    return d > 0 ? r.toFixed(d) : String(r);
  };
  return {
    units: system,
    isMetric: metric,
    weightUnit: metric ? 'kg' : 'lb',
    distanceUnit: metric ? 'km' : 'mi',
    // Convert a native Imperial value (lb / mi) to the active system's number.
    convWeight: (lb) => (lb == null ? null : (metric ? lb * LB_TO_KG : lb)),
    convDistance: (mi) => (mi == null ? null : (metric ? mi * MI_TO_KM : mi)),
    // Format a native Imperial value with the active unit appended.
    fmtWeight: (lb, digits = 0, sep = ' ') => (lb == null ? '' : `${num(metric ? lb * LB_TO_KG : lb, digits)}${sep}${metric ? 'kg' : 'lb'}`),
    fmtDistance: (mi, digits = 1, sep = ' ') => (mi == null ? '' : `${num(metric ? mi * MI_TO_KM : mi, digits)}${sep}${metric ? 'km' : 'mi'}`),
  };
}

const BSContext = createContextBS(null);

// Display text-size scale. The app hard-codes font sizes in px, so a Small/
// Medium/Large control scales the whole interface proportionally (applied as
// `zoom` on the phone surface). `zoom` scales the CONTENT only — the surface
// box keeps its 100%×100% fill — so the UI reflows bigger/smaller while still
// fitting the frame exactly. The same idea as iOS Display Zoom.
const BS_TEXT_SCALES = { small: 0.9, medium: 1, large: 1.12 };
function bsTextScale(key) { return BS_TEXT_SCALES[key] || 1; }

function BSProvider({ children, paperMode, accentKey, densityKey, borderKey, weightKey, textScaleKey, textureKey, textureColor, inkOverride }) {
  const P = makePalette({ paperMode, accentKey, inkOverride });
  const D = makeDensity(densityKey);
  const B = makeBorders(borderKey, P);
  const W = makeWeights(weightKey);
  // Texture tint: explicit textureColor (hex) wins over the auto-from-paper ink RGB.
  const _txOverride = textureColor && textureColor !== 'auto' ? _hexToRGB(textureColor) : null;
  const _txRGB = _txOverride || P.inkRGB || '15,14,12';
  const TEXTURE = makeTexture(textureKey, _txRGB, P.isLight);
  // Subscribe to the global units preference so flipping it re-renders every
  // consumer of the theme with the new formatters.
  const [unitSystem, setUnitSystem] = useStateBS(bsUnitSystem);
  useEffectBS(() => ShapeUnits.subscribe(setUnitSystem), []);
  const value = { ...P, ...D, B, W, TEXTURE, textureKey, textureColor,
    DISPLAY: DISPLAY_BS, BODY: BODY_BS, MONO: MONO_BS,
    densityKey, borderKey, weightKey,
    textScaleKey: textScaleKey || 'medium', TEXT_SCALE: bsTextScale(textScaleKey),
    ...bsUnitFormatters(unitSystem),
  };
  return (
    <BSContext.Provider value={value}>
      <div className={`${P.isLight ? 'bs-light' : 'bs-dark'}${textureKey && textureKey !== 'none' ? ' bs-grain-on' : ''}`} style={{ display: 'contents' }}>
        {children}
      </div>
    </BSContext.Provider>
  );
}

function useBS() {
  const v = useContextBS(BSContext);
  if (!v) throw new Error('useBS must be inside BSProvider');
  return v;
}

function isNativeBSApp() {
  return document.documentElement.classList.contains('is-native-app') ||
    !!window.Capacitor?.isNativePlatform?.();
}

function getTargetScroller(eventTarget) {
  const targetScroller = eventTarget?.closest?.('.bs-scroll');
  if (targetScroller) return targetScroller;
  return document.querySelector('.bs-scroll');
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    'input, textarea, select, button, a, label, [role="button"], [contenteditable="true"]'
  ));
}

// ═══════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════

// Page wrapper — sets paper background and provides scroll
function BSPage({ children, tabBarHeight = 72, backdrop = null, mast = true, noSwipe = false }) {
  const t = useBS();
  const scrollerRef = useRefBS(null);
  // Condensing masthead: once the page's own masthead scrolls away (~64px), a
  // pinned strip (logo + Vol·No + the standard corner) slides in over the
  // scroller — ONE implementation, so the cushion is identical on every page.
  // Full-screen flows with their own chrome (e.g. the meal logger) opt out
  // with mast={false}.
  const [mastCondensed, setMastCondensed] = useStateBS(false);

  useEffectBS(() => {
    if (!mast) return undefined;
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onScroll = () => setMastCondensed(el.scrollTop > 64);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [mast]);

  useEffectBS(() => {
    const el = scrollerRef.current;
    if (!el || !isNativeBSApp()) return undefined;

    let lastY = 0;
    let active = false;
    let moved = false;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      if (isInteractiveTarget(event.target)) return;
      active = true;
      moved = false;
      lastY = event.touches[0].clientY;
    };

    const onTouchMove = (event) => {
      if (event.defaultPrevented) return;
      if (!active || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const delta = lastY - y;
      if (Math.abs(delta) < 2 && !moved) return;
      moved = true;
      lastY = y;
      el.scrollTop += delta;
      event.preventDefault();
    };

    const onTouchEnd = () => {
      active = false;
      moved = false;
    };

    const onWheel = (event) => {
      el.scrollTop += event.deltaY;
      event.preventDefault();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const scroller = (
    <div ref={scrollerRef} className="bs-scroll" {...((mast && !noSwipe) ? {} : { 'data-bs-noswipe': '' })} style={{
      position: 'absolute', inset: 0,
      height: '100%',
      overflowX: 'hidden',
      overflowY: 'scroll',
      WebkitOverflowScrolling: 'touch',
      touchAction: 'pan-y',
      overscrollBehaviorY: 'contain',
      background: backdrop ? 'transparent' : (t.TEXTURE ? `${t.TEXTURE}, ${t.PAPER_BG}` : t.PAPER_BG),
      color: t.INK,
      paddingBottom: `calc(${tabBarHeight + 2}px + env(safe-area-inset-bottom, 0px))`,
      fontFamily: t.BODY,
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }}>
      {children}
    </div>
  );

  // Pinned condensed masthead — mirrors the tab bar's paper treatment (same
  // gradient/blur/hairline/shadow, flipped) so top + bottom chrome read as one
  // instrument. Slides in only once scrolled past the page's own masthead.
  const MastCorner = (typeof window !== 'undefined' && window.BSMastCorner) || null;
  const mastReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pinnedMast = mast ? (
    <div aria-hidden={!mastCondensed} style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60,
      // Match the in-page masthead's gutter (t.padX) AND its element rhythm — a
      // full-size corner (34) with room to breathe, so scrolling doesn't shrink
      // the bar; only its vertical padding is trimmed vs the hero.
      padding: `calc(12px + env(safe-area-inset-top, 0px)) ${t.padX}px 11px`,
      background: `linear-gradient(0deg, rgba(${t.inkRGB},0.05), transparent 26%), ${t.PAPER_BG}`,
      backgroundColor: t.PAPER,
      color: t.INK,
      borderBottom: `1px solid ${t.SURFACE_BORDER}`,
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      boxShadow: `0 16px 40px ${t.isLight ? 'rgba(15,14,12,0.08)' : 'rgba(0,0,0,0.26)'}`,
      transform: mastCondensed ? 'translateY(0)' : 'translateY(-110%)',
      opacity: mastCondensed ? 1 : 0,
      pointerEvents: mastCondensed ? 'auto' : 'none',
      transition: mastReduced ? 'none' : 'transform 200ms ease, opacity 200ms ease',
    }}>
      <BSMastRow trailing={MastCorner ? <MastCorner /> : null} />
    </div>
  ) : null;

  // A backdrop (e.g. cosmic night sky, radio photo) sits fixed behind the
  // scrolling content; the scroller goes transparent so it shows through.
  if (!backdrop) {
    if (!pinnedMast) return scroller;
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {scroller}
        {pinnedMast}
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>{backdrop}</div>
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>{scroller}</div>
      {pinnedMast}
    </div>
  );
}

// Logo — two triangles, right + left pointing toward each other with vertical
// offset (right-triangle sits low, left-triangle sits high). Brand mark.
function BSLogo({ size = 18, color }) {
  const c = color || 'currentColor';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 99 113"
      width={size}
      height={size * (113/99)}
      style={{
        display: 'inline-block',
        flex: '0 0 auto',
        verticalAlign: 'middle',
      }}
    >
      <polygon points="43,39 82,15 82,63" fill={c} />
      <polygon points="17,49 56,73 17,97" fill={c} />
    </svg>
  );
}

function BSLogoMask({ size = 18, color }) {
  const c = color || 'currentColor';
  const mask = 'url("/assets/shape-logo-triangles-transparent.png")';
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size * (113/99),
      background: c,
      WebkitMaskImage: mask,
      maskImage: mask,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }} />
  );
}

// Wordmark — SHAPE set in a thin, wide geometric sans (matches the brand
// wordmark — triangular A, light weight, generous tracking).
// `full` = "THE SHAPE DAILY"; default = "SHAPE".
function BSWordmark({ size = 18, color, full = false, vertical = false, align = 'left' }) {
  const t = useBS();
  const c = color || t.INK;
  const fontSize = Math.max(11, size * 0.78);
  const labelMain = full ? 'THE SHAPE DAILY' : 'SHAPE';
  // Wordmark font — Saira at very thin weight, wide tracking, uppercase.
  // Matches the Shape brand wordmark (geometric, hairline, triangular A).
  const wordFont = `'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif`;
  const wordStyle = {
    fontFamily: wordFont,
    fontWeight: 200,
    fontSize,
    letterSpacing: '0.18em',
    lineHeight: 1,
    textTransform: 'uppercase',
    color: c,
  };
  if (vertical) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap: size * 0.5 }}>
        <BSLogo size={size} color={c} />
        <span style={wordStyle}>{labelMain}</span>
      </div>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.45 }}>
      <BSLogo size={size} color={c} />
      <span style={wordStyle}>{labelMain}</span>
    </span>
  );
}

// Masthead — newspaper-style header with vol/no, optional title block
function BSMasthead({ vol = 'Vol. 1', no = 'No. 1', title, leftKicker, rightKicker, trailing, onBack = null, showDotTexture = true, showDoubleRule = true, thinRule = false, noRule = false, noTopRule = false, titleSize = 36, compact = false }) {
  const t = useBS();
  const inkRgb = t.inkRGB || (t.isLight ? '15,14,12' : '244,237,224');
  // Hero background — only when there's a title (i.e. home pages).
  // Layered: subtle halftone dot wash + faint pinstripes + side vignette + double rule.
  const dotsBg = `radial-gradient(rgba(${inkRgb},0.22) 0.8px, transparent 1.3px)`;
  const stripesBg = `repeating-linear-gradient(135deg,
      rgba(${inkRgb},0.03) 0, rgba(${inkRgb},0.03) 1px,
      transparent 1px, transparent 7px)`;
  return (
    <div style={{
      padding: `${compact ? 42 : 64}px ${t.padX}px ${title ? (compact ? 11 : 18) : 14}px`,
      borderBottom: noRule ? 0 : (thinRule ? `1px solid ${t.INK}` : (title ? `3px solid ${t.INK}` : `2px solid ${t.INK}`)),
      position: 'relative', overflow: 'hidden',
      backgroundColor: title ? `rgba(${inkRgb},0.012)` : 'transparent',
    }}>
      {/* Hero bg layer — only on title mastheads */}
      {title && (
        <>
          {/* Diagonal pinstripes — engraving feel */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: stripesBg,
            WebkitMaskImage: 'linear-gradient(180deg, black 0%, rgba(0,0,0,0.5) 65%, transparent 100%)',
            maskImage: 'linear-gradient(180deg, black 0%, rgba(0,0,0,0.5) 65%, transparent 100%)',
          }} />
          {/* Halftone dot wash — soft, fades top → bottom */}
          {showDotTexture && (
            <div aria-hidden style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: dotsBg, backgroundSize: '7px 7px',
              WebkitMaskImage: 'linear-gradient(180deg, black 0%, rgba(0,0,0,0.55) 50%, transparent 100%)',
              maskImage: 'linear-gradient(180deg, black 0%, rgba(0,0,0,0.55) 50%, transparent 100%)',
            }} />
          )}
          {/* Side vignette — light, just darkens edges a touch */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(ellipse 80% 90% at 50% 50%, transparent 35%, rgba(${inkRgb},0.05) 100%)`,
          }} />
          {/* Top hairline — single thin rule (suppressed when noRule/noTopRule, e.g. the feed + home) */}
          {!noRule && !noTopRule && <div aria-hidden style={{
            position: 'absolute', left: 0, right: 0, top: compact ? 23 : 44, height: 1,
            background: `rgba(${inkRgb},0.5)`,
          }} />}
          {/* Bottom double-rule strip */}
          {showDoubleRule && <div aria-hidden style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 4,
            borderTop: `1px solid ${t.INK}`, borderBottom: `1px solid ${t.INK}`,
            background: t.PAPER_BG,
          }} />}
        </>
      )}

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: title ? (compact ? 4 : 10) : 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BSLogo size={18} color={t.INK} />
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>
            {vol} · {no}
          </div>
        </div>
        {trailing}
      </div>

      {/* Universal back slot — ← BACK on its own row, flush left, directly
          under the masthead row (never top-right; see BSBackButton's rule). */}
      {onBack && (
        <div style={{ position: 'relative', zIndex: 1, marginBottom: title ? 6 : 0 }}>
          <BSBackButton onClick={onBack} />
        </div>
      )}

      {title && (
        <div style={{
          fontFamily: t.DISPLAY, fontWeight: t.W.display,
          fontSize: titleSize, lineHeight: 0.92, letterSpacing: '-0.035em',
          color: t.INK, position: 'relative', zIndex: 1,
        }}>{title}</div>
      )}

      {(leftKicker || rightKicker) && (
      <div style={{
        marginTop: title ? (compact ? 7 : 14) : 8, paddingTop: compact ? 8 : 10, borderTop: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1,
        fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70,
      }}>
        <span>{leftKicker}</span>
        <span>{rightKicker}</span>
      </div>
      )}
    </div>
  );
}

// The standing masthead row — SHAPE logo + "Vol. 1 · No. 1" (+ optional right
// tools). This strip opens EVERY page; BSMasthead/BSPageHeader embed their own
// copy, so reach for this on screens with fully custom headers.
function BSMastRow({ trailing = null, size = 16, style = null }) {
  const t = useBS();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <BSLogo size={size} color={t.INK} />
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>Vol. 1 · No. 1</div>
      </div>
      {trailing}
    </div>
  );
}

// Compact page header (non-masthead, for inner tabs)
function BSPageHeader({ vol = 'Vol. 1', no = 'No. 1', kicker, title, trailing, onBack = null, titleSize = 34 }) {
  const t = useBS();
  return (
    <div style={{ padding: `64px ${t.padX}px 14px` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BSLogo size={16} color={t.INK} />
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>
            {vol} · {no}
          </div>
        </div>
        {trailing}
      </div>
      {/* Universal back slot — own row, flush left, under the masthead row. */}
      {onBack && (
        <div style={{ marginTop: 12 }}>
          <BSBackButton onClick={onBack} />
        </div>
      )}
      {kicker && (
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 600 }}>
          {kicker}
        </div>
      )}
      {title && (
        <div style={{
          fontFamily: t.DISPLAY, fontWeight: t.W.display,
          fontSize: titleSize, lineHeight: 0.92, letterSpacing: '-0.035em',
          color: t.INK, marginTop: 8,
        }}>{title}</div>
      )}
    </div>
  );
}

// Renders a styled (serif / script) avatar monogram as SVG and centres it by
// its REAL rendered geometry (getBBox) — i.e. the actual ink, not the font's
// line-box metrics — so any typeface (incl. script faces whose capitals sit
// high, or whatever the browser falls back to) lands dead-centre on both axes.
// Re-measures once web fonts finish loading.
function BSAvatarGlyph({ init, size, fontFamily, fontStyle, fontWeight, fontSize, color, skew }) {
  const ref = React.useRef(null);
  const [shift, setShift] = React.useState(null);
  React.useLayoutEffect(() => {
    let cancelled = false, raf = 0;
    const measure = () => {
      const el = ref.current;
      if (cancelled || !el || typeof el.getBBox !== 'function') return;
      try {
        const b = el.getBBox();
        if (b && isFinite(b.x) && isFinite(b.y) && b.width > 0 && b.height > 0) {
          setShift({ x: size / 2 - (b.x + b.width / 2), y: size / 2 - (b.y + b.height / 2) });
        }
      } catch (e) {}
    };
    measure();
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(() => { raf = requestAnimationFrame(measure); }).catch(() => {});
    }
    return () => { cancelled = true; if (raf) cancelAnimationFrame(raf); };
  }, [init, fontFamily, fontStyle, fontWeight, fontSize, size]);
  const C = size / 2;
  const dx = shift ? shift.x : 0;
  const dy = shift ? shift.y : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" style={{ display: 'block', overflow: 'visible' }}>
      <text
        ref={ref}
        x={C} y={C}
        textAnchor="middle"
        dominantBaseline="central"
        transform={`translate(${dx} ${dy})${skew ? ` skewX(-11)` : ''}`}
        fill={color}
        style={{ fontFamily, fontStyle, fontWeight, fontSize: `${fontSize}px`, letterSpacing: '0' }}
      >{init}</text>
    </svg>
  );
}

// Avatar — circular (or soft-square) bubble with mono / serif / cursive initials
function BSAvatar({ init = 'A', size = 32, fill, ink, onClick, round = true, glow = false, serif = false, cursive = false }) {
  const t = useBS();
  const bg = fill || t.INK;
  const fontFamily = cursive ? "'Snell Roundhand', 'Apple Chancery', 'Brush Script MT', cursive" : serif ? t.DISPLAY : t.MONO;
  const fontStyle = (serif || cursive) ? 'italic' : 'normal';
  const fontSize = cursive ? Math.round(size * 0.46) : serif ? Math.round(size * 0.5) : size * 0.42;
  const fontWeight = cursive ? 600 : 700;
  const styled = serif || cursive;
  return (
    <button onClick={onClick} style={{
      width: size, height: size,
      background: bg, color: ink || t.PAPER,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily, fontStyle, fontSize, fontWeight,
      lineHeight: 1,
      border: 0, padding: 0, cursor: onClick ? 'pointer' : 'default',
      letterSpacing: styled ? '0' : '-0.02em',
      borderRadius: round ? '50%' : t.RADIUS_SM,
      boxShadow: glow ? `0 0 22px ${bg}5e, 0 0 0 4px ${bg}26` : 'none',
    }}>{styled
      // Styled monograms (script/serif) are SVG-centred by their real geometry.
      ? <BSAvatarGlyph init={init} size={size} fontFamily={fontFamily} fontStyle={fontStyle} fontWeight={fontWeight} fontSize={fontSize} color={ink || t.PAPER} skew={serif} />
      : init}</button>
  );
}

// Eyebrow — mono uppercase tracked label
function BSEyebrow({ children, color, weight = 600 }) {
  const t = useBS();
  return (
    <span style={{
      fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em',
      textTransform: 'uppercase', color: color || t.INK70, fontWeight: weight,
    }}>{children}</span>
  );
}

// Section header bar — "▍ TITLE" + right-side meta
function BSSection({ title, meta, kicker, color }) {
  const t = useBS();
  return (
    <div style={{
      padding: `${t.sectGap}px ${t.padX}px 10px`,
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 11, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: color || t.INK,
      }}>
        ▍ {title}
      </span>
      {kicker && (
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          {kicker}
        </span>
      )}
      {meta && (
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.16em', textTransform: 'uppercase', marginLeft: 'auto' }}>
          {meta}
        </span>
      )}
    </div>
  );
}

// Slab — full-bleed block with top/bottom rules, used for headline content
function BSSlab({ children, tinted, accent, padded = true }) {
  const t = useBS();
  return (
    <div style={{
      margin: `0 ${t.padX}px 10px`,
      padding: padded ? '15px 16px 17px' : 0,
      background: accent ? accent : (tinted ? t.SURFACE_STRONG : t.SURFACE),
      border: `1px solid ${t.SURFACE_BORDER}`,
      borderRadius: t.RADIUS_LG,
      boxShadow: t.ELEVATION_SOFT,
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
    }}>{children}</div>
  );
}

// Cell — bordered rectangle, like a box advert
function BSCell({ children, dark, accent, onClick, style }) {
  const t = useBS();
  const bg = dark ? t.INK : (accent || t.SURFACE);
  const fg = dark ? t.PAPER : t.INK;
  return (
    <div onClick={onClick} style={{
      padding: 14, border: `1px solid ${dark ? t.INK : t.SURFACE_BORDER}`,
      background: bg, color: fg, cursor: onClick ? 'pointer' : 'default',
      borderRadius: t.RADIUS_LG,
      boxShadow: dark ? 'none' : t.ELEVATION_SOFT,
      backdropFilter: dark ? 'none' : 'blur(14px)',
      WebkitBackdropFilter: dark ? 'none' : 'blur(14px)',
      ...style,
    }}>{children}</div>
  );
}

// Tag — mono pill (filled rectangle, not rounded)
function BSTag({ children, color, dark }) {
  const t = useBS();
  const bg = color || t.INK;
  return (
    <span style={{
      fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em',
      color: t.PAPER, background: bg, padding: '4px 7px', textTransform: 'uppercase', fontWeight: 700,
      display: 'inline-block', lineHeight: 1.3,
      borderRadius: 999,
    }}>{children}</span>
  );
}

// Tabular row inside a "stock listing"
function BSRow({ time, tag, tagColor, title, sub, state, onClick, last }) {
  const t = useBS();
  const done = state === 'done';
  const next = state === 'next';
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '52px 40px 1fr',
      alignItems: 'center', gap: 10, padding: `${t.rowY}px 0`,
      borderBottom: last ? 0 : `1px solid ${t.HAIR}`,
      opacity: done ? 0.4 : 1,
      background: next ? `${t.ACCENT}10` : 'transparent',
      marginLeft: next ? -8 : 0, marginRight: next ? -8 : 0,
      paddingLeft: next ? 8 : 0, paddingRight: next ? 8 : 0,
      borderRadius: next ? t.RADIUS_SM : 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <span style={{
        fontFamily: t.MONO, fontSize: 12, color: next ? t.ACCENT : t.INK,
        letterSpacing: '-0.01em', fontWeight: next ? 700 : 500,
        fontVariantNumeric: 'tabular-nums',
      }}>{time}</span>
      {tag && (
        <span style={{
          fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em',
          color: t.PAPER, background: tagColor || t.INK,
          padding: '2px 4px', textTransform: 'uppercase', fontWeight: 700,
          textAlign: 'center', justifySelf: 'start',
          borderRadius: t.RADIUS_SM,
        }}>{tag}</span>
      )}
      {!tag && <span />}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: t.BODY, fontSize: 14, fontWeight: next ? 700 : 500, color: t.INK,
          letterSpacing: '-0.01em', lineHeight: 1.15,
          textDecoration: done ? 'line-through' : 'none', textDecorationThickness: '1.5px',
        }}>{title}</div>
        {sub && (
          <div style={{
            fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 2,
            letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

// Big numeric headline ("LEAD")
function BSHeadlineNumber({ sign = '', value, unit, color, size }) {
  const t = useBS();
  const n = size || t.headlineHero;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      {sign && (
        <span style={{ fontFamily: t.DISPLAY, fontSize: n * 0.18, fontWeight: 600, color: t.INK50, marginTop: n * 0.13 }}>
          {sign}
        </span>
      )}
      <span style={{
        fontFamily: t.DISPLAY, fontSize: n, fontWeight: t.W.display,
        lineHeight: 0.85, letterSpacing: '-0.06em', color: color || t.INK,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
      {unit && (
        <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, letterSpacing: '0.12em', marginTop: n * 0.085, marginLeft: 4 }}>
          {unit}
        </span>
      )}
    </div>
  );
}

// Ticker — black bar with scrolling content
function BSTicker({ items, speedSec = 30, fg = '#7ed4ff' }) {
  const t = useBS();
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return null; // no metrics → no ticker strip (e.g. signed-in, no live data)
  return (
    <div style={{
      position: 'relative',
      background: t.INK, color: t.PAPER,
      clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)',
      borderLeft: `3px solid ${t.ACCENT}`,
      padding: '8px 0', overflow: 'hidden', whiteSpace: 'nowrap',
      fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.12em',
    }}>
      {/* fixed live tick — a solid cap the marquee scrolls beneath */}
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 20, background: t.INK, zIndex: 1, display: 'grid', placeItems: 'center' }}>
        <span style={{ width: 6, height: 6, borderRadius: 1.5, background: t.ACCENT, boxShadow: `0 0 8px ${t.ACCENT}`, animation: 'bstickerPulse 2.6s ease-in-out infinite' }} />
      </span>
      <div style={{ display: 'inline-block', animation: `bsticker ${speedSec}s linear infinite`, paddingLeft: '100%' }}>
        {Array(2).fill(null).map((_, n) => (
          <span key={n}>
            {rows.map((it, i) => (
              <span key={i}>
                {it.label} <span style={{ color: it.color || fg }}>{it.value}</span>
                {it.note && <span style={{ opacity: 0.7 }}> · {it.note}</span>}
                &nbsp;&nbsp;·&nbsp;&nbsp;
              </span>
            ))}
            ◆ &nbsp;&nbsp;
          </span>
        ))}
      </div>
      <style>{`@keyframes bsticker { from { transform: translateX(0); } to { transform: translateX(-50%); } } @keyframes bstickerPulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}

// Halftone "image placeholder" — duotone CSS pattern, no real photo needed
function BSHalftone({ height = 180, accent, pattern = 'dots' }) {
  const t = useBS();
  const c1 = t.INK;
  const c2 = accent || t.ACCENT;
  const bg = pattern === 'dots'
    ? `radial-gradient(circle at 25% 25%, ${c1} 0%, ${c1} 22%, transparent 23%),
       radial-gradient(circle at 75% 75%, ${c1} 0%, ${c1} 22%, transparent 23%),
       radial-gradient(circle at 75% 25%, ${c1} 0%, ${c1} 12%, transparent 13%),
       radial-gradient(circle at 25% 75%, ${c1} 0%, ${c1} 12%, transparent 13%),
       linear-gradient(135deg, ${c2} 0%, ${c2} 100%)`
    : `repeating-linear-gradient(45deg, ${c1} 0 2px, transparent 2px 6px), linear-gradient(${c2}, ${c2})`;
  return (
    <div style={{
      height,
      backgroundImage: bg,
      backgroundSize: pattern === 'dots' ? '12px 12px, 12px 12px, 12px 12px, 12px 12px, 100% 100%' : 'auto',
      border: `1px solid ${t.INK}`,
    }} />
  );
}

// Tab bar — Broadsheet style: thick top rule, mono labels, accent active
// Line-art tab icons — monochrome, inherit color via currentColor.
const BS_TAB_ICON_KEYS = new Set(['home', 'train', 'eat', 'chat', 'store', 'me', 'today', 'clients', 'programs', 'plans']);
function BSTabIcon({ name, size = 22 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'home': return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /></svg>;
    case 'train': return <svg {...p}><path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" /></svg>;
    case 'eat': return <svg {...p}><path d="M12 8c-1-2-4-2.4-5.6-.9C4 8.8 4.6 13 7 16.4c1 1.4 1.9 1.9 2.7 1.5.8-.4 1.8-.4 2.6 0 .8.4 1.7-.1 2.7-1.5 2.4-3.4 3-7.6.6-9.3C16 5.6 13 6 12 8Z" /><path d="M12 8c0-1.8 1-3.2 3-3.7" /></svg>;
    case 'chat': return <svg {...p}><path d="M4.5 5.5h15v10h-10l-4 3.5v-3.5h-1z" /></svg>;
    case 'store': return <svg {...p}><path d="M5.5 8h13l-1 11.5h-11z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>;
    case 'me': return <svg {...p}><circle cx="12" cy="8.2" r="3.3" /><path d="M5.6 20c0-3.5 3-5.5 6.4-5.5S18.4 16.5 18.4 20" /></svg>;
    case 'today': return <svg {...p}><path d="M4.5 6.5h15v13h-15z" /><path d="M4.5 10.5h15" /><path d="M8.5 4v4M15.5 4v4" /><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" /></svg>;
    case 'clients': return <svg {...p}><circle cx="9" cy="8.4" r="2.8" /><path d="M3.6 19c0-3 2.4-4.7 5.4-4.7s5.4 1.7 5.4 4.7" /><path d="M16 6.1a2.8 2.8 0 0 1 0 5.4" /><path d="M17.2 14.5c2.2.5 3.5 2 3.5 4.4" /></svg>;
    case 'programs':
    case 'plans': return <svg {...p}><path d="M6.5 5.5h11v14h-11z" /><path d="M9.2 5.5V4.2h5.6v1.3" /><path d="M9 10h6M9 13.5h6M9 17h4" /></svg>;
    default: return null;
  }
}

// ── Instrument plate — the boxy design signature ─────────────────────────────
// Clipped top-right corner (two stacked clip layers fake the border, since a
// real border gets eaten by clip-path), hard accent spine, optional pulsing
// status tick + corner bracket. Two-tier rule: plates dress LIVE/ACTIONABLE
// surfaces (heroes, up-next cards, stat tiles, CTAs); quiet rounded cards stay
// for forms/sheets/lists, and chat bubbles stay round.
function BSPlate({ c, notch = 12, spine = 3, tick = false, bracket = false, pad = '14px 16px', style, onClick, onKeyDown, tabIndex, role, ariaLabel, children }) {
  const t = useBS();
  const clip = (n) => `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, 0 100%)`;
  return (
    <div onClick={onClick} onKeyDown={onKeyDown} tabIndex={tabIndex} role={role} aria-label={ariaLabel} style={{ position: 'relative', ...(onClick ? { cursor: 'pointer' } : null), ...style }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, clipPath: clip(notch + 1), background: `${c}77` }} />
      <div aria-hidden style={{ position: 'absolute', inset: 1.25, clipPath: clip(notch), background: `linear-gradient(165deg, ${c}1f, ${c}06 45%, ${t.PAPER2} 90%), ${t.PAPER}` }} />
      {spine > 0 && <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: spine, background: c }} />}
      {tick && <div aria-hidden style={{ position: 'absolute', left: 8, top: 16, width: 6, height: 6, borderRadius: 1.5, background: c, boxShadow: `0 0 9px ${c}`, animation: 'bsPlatePulse 2.6s ease-in-out infinite' }} />}
      {bracket && <div aria-hidden style={{ position: 'absolute', right: 6, bottom: 6, width: 8, height: 8, borderRight: `1.5px solid ${c}`, borderBottom: `1.5px solid ${c}`, opacity: 0.65 }} />}
      <div style={{ position: 'relative', padding: pad }}>{children}</div>
      {tick && <style>{`@keyframes bsPlatePulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }`}</style>}
    </div>
  );
}

function BSTabBar({ tabs, active, onChange }) {
  const t = useBS();
  // Chat-tab unread badge — read from the app-wide ShapeUnread manager (the tab
  // bar is always mounted, so this is where we start + watch it).
  const [chatUnread, setChatUnread] = React.useState(() => (window.ShapeUnread?.total?.() || 0));
  React.useEffect(() => {
    // Signed in → live unread; logged out → demo seed so the badge still shows.
    const loggedIn = !!(window.ShapeAuth?.getCachedState?.().user?.id);
    if (loggedIn) window.ShapeUnread?.start?.();
    else window.ShapeUnread?.seedDemo?.();
    const off = window.ShapeUnread?.onChange?.(() => setChatUnread(window.ShapeUnread?.total?.() || 0));
    setChatUnread(window.ShapeUnread?.total?.() || 0);
    return () => { try { off && off(); } catch (e) {} };
  }, []);
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 55,
      height: 64, padding: '5px 20px calc(8px + env(safe-area-inset-bottom, 0px))',
      // Match the page's full background (PAPER_BG carries metallic/textured sheen
      // on papers like Steel) so the bar reads as part of the same paper, with a
      // faint theme-derived top fade for separation. Adapts to every paper.
      background: `linear-gradient(180deg, rgba(${t.inkRGB},0.05), transparent 26%), ${t.PAPER_BG}`,
      backgroundColor: t.PAPER,
      color: t.INK,
      borderTop: `1px solid ${t.SURFACE_BORDER}`,
      display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, gap: 10,
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      boxShadow: `0 -16px 40px ${t.isLight ? 'rgba(15,14,12,0.08)' : 'rgba(0,0,0,0.26)'}`,
    }}>
      {/* Instrument dock rail — accent gradient hairline with a glowing tick
          that slides to sit above the active tab. */}
      {(() => {
        const activeIdx = Math.max(0, tabs.findIndex((tb) => tb.key === active));
        const n = tabs.length;
        return (
          <React.Fragment>
            <span aria-hidden style={{ position: 'absolute', top: -1, left: 0, right: 0, height: 1.5, background: `linear-gradient(90deg, transparent, ${t.ACCENT}44 28%, ${t.ACCENT}44 72%, transparent)` }} />
            <span aria-hidden style={{ position: 'absolute', top: -1.5, height: 2.5, borderRadius: 2, width: `calc((100% - 40px) / ${n} * 0.44)`, left: `calc(20px + ((100% - 40px) / ${n}) * (${activeIdx} + 0.28))`, background: t.ACCENT, boxShadow: `0 0 9px ${t.ACCENT}`, transition: 'left .28s cubic-bezier(.4,0,.2,1)' }} />
          </React.Fragment>
        );
      })()}
      {tabs.map((tab, i) => {
        const on = tab.key === active;
        return (
          <button key={tab.key} type="button" data-tour={'tab-' + tab.key} onClick={() => onChange(tab.key)} style={{
            border: 0, background: 'transparent',
            cursor: 'pointer', padding: '3px 0',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            color: on ? t.ACCENT : t.INK50, position: 'relative',
          }}>
            {/* Active tab rides a clipped instrument plate with an accent spine. */}
            {on && <span aria-hidden style={{ position: 'absolute', inset: '1px 2px 3px', clipPath: 'polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)', background: `linear-gradient(165deg, ${t.ACCENT}2e, ${t.ACCENT}0a 72%)` }} />}
            {on && <span aria-hidden style={{ position: 'absolute', left: 2, top: 1, bottom: 3, width: 2.5, background: t.ACCENT }} />}
            <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              {BS_TAB_ICON_KEYS.has(tab.key)
                ? <BSTabIcon name={tab.key} size={20} />
                : <span style={{ fontFamily: t.MONO, fontWeight: 700, fontSize: 10.5, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</span>}
              {on && (
                <span style={{
                  fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800,
                }}>{tab.label}</span>
              )}
            </span>
            {tab.key === 'chat' && chatUnread > 0 && (
              <span style={{ position: 'absolute', top: 0, left: '52%', minWidth: 15, height: 15, borderRadius: 4, background: '#ff5a5f', color: '#fff', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>{chatUnread > 9 ? '9+' : chatUnread}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Footer masthead — closes a page like a paper footer
// The page footnote (e.g. "Shape · Pg 1 of 1") was removed from every page —
// render nothing. Kept as a no-op so the many <BSFooter/> call sites still work.
function BSFooter() {
  return null;
}

// Phone bezel — light/dark sensitive
// Global toast host. Registers window.__bsToast so the imperative
// window.__bsToast(message, kind) calls sprinkled across the app actually
// surface something (previously this global was never assigned, so every
// toast was a silent no-op). Mounted once inside BSPhone.
function BSToastHost() {
  const t = useBS();
  const [items, setItems] = useStateBS([]);
  useEffectBS(() => {
    // Toast popups are disabled app-wide. Keep window.__bsToast as a no-op so the
    // many window.__bsToast?.(…) callers stay safe, but nothing is surfaced.
    window.__bsToast = () => {};
    return () => {
      try { delete window.__bsToast; } catch (e) { window.__bsToast = undefined; }
    };
  }, []);
  if (!items.length) return null;
  const colorFor = (kind) =>
    (kind === 'err' || kind === 'error') ? t.RUST
    : kind === 'ok' ? t.GREEN
    : kind === 'warn' ? t.AMBER
    : t.ACCENT;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0,
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      padding: '0 18px', zIndex: 4000, pointerEvents: 'none',
    }}>
      {items.map((it) => (
        <div key={it.id} style={{
          maxWidth: '100%', pointerEvents: 'auto',
          background: t.INK, color: t.PAPER,
          borderLeft: `3px solid ${colorFor(it.kind)}`,
          borderRadius: 10, padding: '10px 14px',
          fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.4,
          boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
        }}>{it.message}</div>
      ))}
    </div>
  );
}

// ── Destructive-action confirm sheet ─────────────────────────────────────────
// Reusable, house-style confirmation for destructive / irreversible actions.
// Names the specific item, states the consequence, uses an action-labeled
// confirm button, and is dressed in RUST (the danger accent) with a left spine
// so it reads as an alarming surface. `requireType` adds a type-to-confirm text
// gate for the most irreversible actions (e.g. account deletion). Mounted once
// via BSConfirmHost and driven imperatively through window.bsAskConfirm(opts),
// which resolves a Promise<boolean>. We keep toasts disabled app-wide; this
// confirm IS the deliberate friction layer (not an undo snackbar).
function BSConfirmSheet({ opts, onCancel, onConfirm }) {
  const t = useBS();
  const o = opts || {};
  const danger = o.danger !== false; // destructive by default
  const accent = danger ? t.RUST : t.ACCENT;
  const [typed, setTyped] = useStateBS('');
  const need = o.requireType ? String(o.requireType) : '';
  const gateOk = !need || (typed || '').trim().toUpperCase() === need.toUpperCase();
  const eyebrow = o.eyebrow || (danger ? "Confirm · this can't be undone" : 'Confirm');
  return (
    <div onClick={onCancel} style={{ position: 'absolute', inset: 0, zIndex: 4200, background: 'rgba(8,7,6,0.6)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, borderLeft: `3px solid ${accent}`, padding: `20px ${t.padX || 18}px calc(20px + env(safe-area-inset-bottom, 0px))` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>{eyebrow}</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, margin: '5px 0 0' }}>{o.title || 'Are you sure?'}</div>
        {o.name && <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: accent, margin: '3px 0 0' }}>{o.name}</div>}
        {o.message && <div style={{ marginTop: 11, fontFamily: t.BODY, fontSize: 13, color: t.INK70, lineHeight: 1.5 }}>{o.message}</div>}
        {need && (
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${need} to confirm`}
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 13, padding: '12px 14px', borderRadius: 12, border: `1px solid ${gateOk && typed ? accent : t.HAIR}`, background: `${t.INK}09`, color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '0.04em', outline: 'none' }} />
        )}
        <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: '0 0 auto', padding: '14px 24px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{o.cancelLabel || 'Cancel'}</button>
          <button onClick={() => gateOk && onConfirm()} disabled={!gateOk}
            style={{ flex: 1, minHeight: 48, borderRadius: 999, border: 0, background: gateOk ? accent : `${accent}55`, color: t.PAPER, fontFamily: t.BODY, fontSize: 14, fontWeight: 700, letterSpacing: '0.01em', cursor: gateOk ? 'pointer' : 'default', opacity: gateOk ? 1 : 0.7 }}>{o.confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

// Mounted once inside the phone surface (next to BSToastHost). Registers
// window.__bsConfirm(opts) -> Promise<boolean>; window.bsAskConfirm (below) is
// the safe caller used across the app.
function BSConfirmHost() {
  const [req, setReq] = useStateBS(null);
  useEffectBS(() => {
    // Resolve any still-pending request as cancelled before queuing a new one,
    // so a second confirm can't orphan the first promise (its caller would hang).
    window.__bsConfirm = (opts) => new Promise((resolve) => setReq((prev) => {
      if (prev) { try { prev.resolve(false); } catch (e) {} }
      return { opts: opts || {}, resolve };
    }));
    return () => { try { delete window.__bsConfirm; } catch (e) { window.__bsConfirm = undefined; } };
  }, []);
  if (!req) return null;
  const done = (val) => { try { req.resolve(val); } catch (e) {} setReq(null); };
  return <BSConfirmSheet opts={req.opts} onCancel={() => done(false)} onConfirm={() => done(true)} />;
}

// Safe imperative caller. Returns Promise<boolean>. Uses the mounted confirm
// host when present; falls back to a native confirm so a destructive action is
// never left ungated even if called before the host mounts.
function bsAskConfirm(opts) {
  if (typeof window !== 'undefined' && typeof window.__bsConfirm === 'function') return window.__bsConfirm(opts || {});
  const o = opts || {};
  // No host + no window → fail CLOSED (never auto-approve a destructive action).
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return Promise.resolve(false);
  const text = [o.title, o.name, o.message].filter(Boolean).join('\n\n');
  // Preserve the type-to-confirm gate in fallback mode — don't downgrade an
  // irreversible action (e.g. account deletion) to a one-tap confirm.
  if (o.requireType) {
    const typed = typeof window.prompt === 'function' ? window.prompt(`${text}\n\nType ${o.requireType} to confirm.`) : null;
    return Promise.resolve((typed || '').trim().toUpperCase() === String(o.requireType).toUpperCase());
  }
  return Promise.resolve(window.confirm(text || 'Are you sure?'));
}
if (typeof window !== 'undefined') window.bsAskConfirm = bsAskConfirm;

function BSPhone({ children }) {
  const t = useBS();
  const isNativeApp = isNativeBSApp();
  // Inject the weight-shift CSS once. When data-bs-weight="regular" is set on the
  // phone surface, every nested element's font-weight gets a step lighter via
  // CSS attribute selectors (300/400 instead of 600/700/800).
  useEffectBS(() => {
    if (document.getElementById('bs-weight-css')) return;
    const s = document.createElement('style');
    s.id = 'bs-weight-css';
    s.textContent = `
      [data-bs-weight="regular"] *,
      [data-bs-weight="regular"] {
        font-weight: 300 !important;
      }
      [data-bs-weight="regular"] [style*="font-weight: 800"],
      [data-bs-weight="regular"] [style*="fontWeight: 800"] { font-weight: 500 !important; }
      [data-bs-weight="regular"] [style*="font-weight: 700"],
      [data-bs-weight="regular"] [style*="fontWeight: 700"] { font-weight: 400 !important; }
      [data-bs-weight="regular"] [style*="font-weight: 600"],
      [data-bs-weight="regular"] [style*="fontWeight: 600"] { font-weight: 400 !important; }
      [data-bs-weight="regular"] [style*="font-weight: 500"],
      [data-bs-weight="regular"] [style*="fontWeight: 500"] { font-weight: 300 !important; }
      [data-bs-weight="regular"] [style*="font-weight: 400"],
      [data-bs-weight="regular"] [style*="fontWeight: 400"] { font-weight: 300 !important; }
      [data-bs-weight="regular"] .bs-splash-title,
      [data-bs-weight="regular"] .bs-splash-title *,
      [data-bs-weight="regular"] .bs-daily-title,
      [data-bs-weight="regular"] .bs-daily-title * {
        font-family: 'Newsreader', Georgia, serif !important;
      }
      [data-bs-weight="regular"] .bs-splash-title .bs-splash-the,
      [data-bs-weight="regular"] .bs-daily-title .bs-daily-the {
        font-weight: 700 !important;
      }
      [data-bs-weight="regular"] .bs-splash-title .bs-splash-shape,
      [data-bs-weight="regular"] .bs-daily-title .bs-daily-shape {
        font-family: 'Saira', 'Space Grotesk', 'Helvetica Neue', sans-serif !important;
        font-style: normal !important;
        font-weight: 300 !important;
        letter-spacing: 0.18em !important;
        text-transform: uppercase !important;
      }
      [data-bs-weight="regular"] .bs-splash-title .bs-splash-daily,
      [data-bs-weight="regular"] .bs-daily-title .bs-daily-daily {
        font-weight: 700 !important;
      }
    `;
    document.head.appendChild(s);
  }, []);

  useEffectBS(() => {
    if (!isNativeApp) return undefined;

    let activeScroller = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let dragging = false;

    const resetGesture = () => {
      activeScroller = null;
      startX = 0;
      startY = 0;
      lastY = 0;
      dragging = false;
    };

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      if (isInteractiveTarget(event.target)) return;

      const scroller = getTargetScroller(event.target);
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 2) return;

      const touch = event.touches[0];
      activeScroller = scroller;
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      dragging = false;
    };

    const onTouchMove = (event) => {
      if (!activeScroller || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!dragging) {
        if (Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          resetGesture();
          return;
        }
        dragging = true;
      }

      const delta = lastY - touch.clientY;
      lastY = touch.clientY;
      const max = Math.max(0, activeScroller.scrollHeight - activeScroller.clientHeight);
      activeScroller.scrollTop = Math.max(0, Math.min(max, activeScroller.scrollTop + delta));
      event.preventDefault();
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', resetGesture, { capture: true, passive: true });
    document.addEventListener('touchcancel', resetGesture, { capture: true, passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', resetGesture, true);
      document.removeEventListener('touchcancel', resetGesture, true);
    };
  }, [isNativeApp]);

  if (isNativeApp) {
    return (
      <div data-bs-weight={t.weightKey || 'bold'} style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        background: t.PAPER_BG,
        overflow: 'hidden',
        touchAction: 'auto',
        fontFamily: t.BODY,
      }}>
        <div id="bs-phone-surface" className="bs-paper-grain" style={{
          // Text-size scale: `zoom` scales the CONTENT only (not the box), so
          // the surface keeps filling the frame exactly while the UI reflows
          // bigger/smaller. zoom:1 (medium) is a no-op.
          width: '100%',
          height: '100%',
          zoom: t.TEXT_SCALE || 1,
          overflow: 'hidden',
          position: 'relative',
          background: t.PAPER_BG,
        }}>
          {children}
          <BSToastHost />
          <BSConfirmHost />
        </div>
      </div>
    );
  }

  return (
    <div data-bs-weight={t.weightKey || 'bold'} style={{
      width: 'min(390px, calc(100vw - 16px))',
      height: 'min(844px, calc(100dvh - 16px))',
      borderRadius: 54, padding: 12,
      background: t.isLight
        ? (t.paperMode === 'manila' ? '#3d2d12'
          : t.paperMode === 'steel' ? '#2a2d33'
          : t.paperMode === 'bone' ? '#2a2418'
          : t.paperMode === 'sage' ? '#1e2415'
          : t.paperMode === 'rose' ? '#2e1418'
          : t.paperMode === 'mist' ? '#161d24'
          : '#1a1612')
        : (t.paperMode === 'teal' ? '#021f1a'
          : t.paperMode === 'blueprint' ? '#04132b'
          : t.paperMode === 'carbon' ? '#000000'
          : t.paperMode === 'oxblood' ? '#1a0608'
          : t.paperMode === 'forest' ? '#06140e'
          : t.paperMode === 'slate' ? '#0a0e14'
          : t.paperMode === 'plum' ? '#120819'
          : t.paperMode === 'cocoa' ? '#140c07'
          : t.paperMode === 'midnight' ? '#060814'
          : '#0a0907'),
      boxShadow: '0 30px 80px rgba(0,0,0,0.35), inset 0 0 0 2px rgba(255,255,255,0.04)',
      position: 'relative',
      fontFamily: t.BODY,
    }}>
      <div id="bs-phone-surface" className="bs-paper-grain" style={{
        // Text-size scale (see native branch) — `zoom` scales content only,
        // so the surface stays exactly frame-sized.
        width: '100%', height: '100%',
        zoom: t.TEXT_SCALE || 1,
        borderRadius: 42, overflow: 'hidden',
        position: 'relative', background: t.PAPER_BG,
      }}>
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          width: 110, height: 32, borderRadius: 16, background: '#000', zIndex: 100,
        }} />
        {children}
        <BSToastHost />
        <BSConfirmHost />
      </div>
    </div>
  );
}

// Expose
// Shared compact "Back" — ONE consistent style for page-level back navigation
// across the app: a plain mono "← BACK" text-action (owner call 2026-07-13:
// no button chrome/bubble on any back control). Replaces the many ad-hoc
// inline variants so they all match.
// THE UNIVERSAL PLACEMENT RULE (owner call 2026-07-14): the back button sits
// on its OWN ROW, flush LEFT at the page gutter, DIRECTLY BELOW the masthead
// row (logo + Vol·No + corners). The page's eyebrow/meta may share that row on
// the right. Never inside the masthead row, never top-right, never bottom.
// BSDetailHeader (client) and BSMasthead/BSPageHeader's `onBack` slot are the
// canonical implementations — new pages use one of those, not an ad-hoc copy.
function BSBackButton({ onClick, label = 'Back', style }) {
  const t = useBS();
  return (
    <button type="button" onClick={onClick} aria-label={label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'transparent', border: 0,
      padding: '8px 2px', cursor: 'pointer', color: t.INK,
      fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
      textTransform: 'uppercase', lineHeight: 1, flexShrink: 0, ...style,
    }}>
      <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>←</span>{label}
    </button>
  );
}
// ═══ Swipe navigation (spec 2026-07-09 §4 · PR C) ═══════════════════════════
// One gesture layer for all three shells: capture-phase, ALWAYS-passive touch
// listeners on the phone surface classify a finished touch via the pure
// bsSwipeIntent and dispatch `shape:navGesture` { intent }. The shells apply
// the judgment (back → navBack ‖ close-top-takeover; prev/next-tab → step their
// own tab order when no takeover is open). We never preventDefault, so this
// layer cannot fight browser scrolling or the native scroll handlers above.

// ONE ancestor walk decides whether a touch may become a gesture. Blocked when
// it starts on: an interactive control · a horizontal scroller that actually
// overflows (the `.bs-scroll` class marks MANY scrollers — rails included — so
// nothing is exempted by class; the checks are per-axis) · a touchAction-owning
// surface — `pan-x`/`none` always claim horizontal touches, and `pan-y` claims
// them ONLY on a non-vertically-scrolling element (that's a chart scrub;
// a pan-y element that itself scrolls vertically is just a page/list scroller
// and horizontal is unclaimed there) · a sheet/overlay backdrop · an explicit
// [data-bs-noswipe] opt-out (BSPage stamps it for mast={false} full-screen
// flows and noSwipe pages).
//
// COST NOTE: the walk forces style/layout reads (getComputedStyle, scrollWidth)
// — BSNavGestures therefore calls it only AFTER a finished touch has already
// classified as a gesture geometrically, never on plain taps.
function bsSwipeBlocked(target, surf) {
  // Only TRUE input controls block a swipe at the target level — a horizontal
  // drag on a text field / slider means selection/cursor/value, never nav.
  // Buttons, links and rows deliberately do NOT block: dense pages (rosters,
  // feeds, chat lists) are mostly tappable rows, and a blanket interactive
  // block would leave them swipe-dead. The tap/drag distinction is the
  // platform's: a real finger that travels far enough to classify never
  // synthesizes a click, and these listeners are passive so taps are untouched.
  if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) return true;
  const surfH = (surf && surf.clientHeight) || (typeof window !== 'undefined' ? window.innerHeight : 0);
  let el = target instanceof Element ? target : null;
  while (el && el.id !== 'bs-phone-surface' && el !== document.body) {
    if (el.hasAttribute('data-bs-noswipe')) return true;
    const s = getComputedStyle(el);
    const ta = s.touchAction || '';
    // pan-y on a DECLARED vertical scroller is just page/list scrolling —
    // horizontal is unclaimed. pan-y on a non-scroller (overflow visible) is a
    // chart scrub claiming horizontal touches. Declared, not measured: a short
    // page whose content happens to fit must not lose tab-swipe.
    const declaresY = s.overflowY === 'auto' || s.overflowY === 'scroll';
    if (/(^|\s)(none|pan-x)(\s|$)/.test(ta)) return true;
    if (/(^|\s)pan-y(\s|$)/.test(ta) && !declaresY) return true;
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) return true;
    // Sheet/overlay backdrops: every Broadsheet sheet portals in as an
    // `absolute · inset:0 · explicit zIndex` layer, but the z values span 60
    // (quick sheets) → 245 (composers) → 6000+ (loggers) while the chrome
    // strips sit at z 55/60 — no threshold separates them. The signature that
    // does: FULL-HEIGHT coverage plus a real stacking order (z ≥ 10 skips
    // BSPage's z-0/1 backdrop wrappers; the coverage test skips the pinned
    // mast / tab bar / composer slot, all short strips).
    const z = parseInt(s.zIndex, 10);
    if (!Number.isNaN(z) && z >= 10 && (s.position === 'absolute' || s.position === 'fixed') && el.offsetHeight >= surfH * 0.85) return true;
    el = el.parentElement;
  }
  return false;
}

// The tab-swipe slide: subtle 24px settle on the incoming screen, one-shot.
// Reduced motion is handled in CSS (no JS branch), and a tab TAP renders with
// no class at all — the slide only rides an actual swipe.
let _bsNavSwipeCssDone = false;
function bsInjectNavSwipeCss() {
  if (_bsNavSwipeCssDone || typeof document === 'undefined') return;
  _bsNavSwipeCssDone = true;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes bsNavSlideL { from { transform: translateX(24px); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }
    @keyframes bsNavSlideR { from { transform: translateX(-24px); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }
    .bs-nav-slide-l { animation: bsNavSlideL 180ms ease-out; }
    .bs-nav-slide-r { animation: bsNavSlideR 180ms ease-out; }
    @media (prefers-reduced-motion: reduce) {
      .bs-nav-slide-l, .bs-nav-slide-r { animation: none !important; }
    }
  `;
  document.head.appendChild(s);
}

function BSNavGestures() {
  useEffectBS(() => {
    bsInjectNavSwipeCss();
    const surf = document.getElementById('bs-phone-surface') || document.body;
    let start = null;
    const onStart = (e) => {
      if (e.touches.length !== 1) { start = null; return; }
      const t0 = e.touches[0];
      // Normalize x to the SURFACE's left edge — in the desktop preview the
      // phone frame is inset, and the 24px edge zone is the phone's edge, not
      // the browser window's. Only the raw sample is taken here — the DOM
      // blocked-walk is deferred to touchend and runs ONLY for touches whose
      // geometry already classifies (taps stay style/layout-read-free).
      const left = surf.getBoundingClientRect().left;
      start = { x0: t0.clientX - left, y0: t0.clientY, t: Date.now(), target: e.target };
    };
    const onMove = (e) => { if (e.touches.length !== 1) start = null; };
    const onEnd = (e) => {
      if (!start || e.changedTouches.length !== 1) { start = null; return; }
      const t1 = e.changedTouches[0];
      const left = surf.getBoundingClientRect().left;
      const intent = bsSwipeIntent({
        x0: start.x0, y0: start.y0,
        x1: t1.clientX - left, y1: t1.clientY,
        dt: Date.now() - start.t, blocked: false,
      });
      const startTarget = start.target;
      start = null;
      if (!intent) return;
      if (bsSwipeBlocked(startTarget, surf)) return;
      try { window.dispatchEvent(new CustomEvent('shape:navGesture', { detail: { intent } })); } catch (err) {}
    };
    const onCancel = () => { start = null; };
    surf.addEventListener('touchstart', onStart, { capture: true, passive: true });
    surf.addEventListener('touchmove', onMove, { capture: true, passive: true });
    surf.addEventListener('touchend', onEnd, { capture: true, passive: true });
    surf.addEventListener('touchcancel', onCancel, { capture: true, passive: true });
    return () => {
      surf.removeEventListener('touchstart', onStart, true);
      surf.removeEventListener('touchmove', onMove, true);
      surf.removeEventListener('touchend', onEnd, true);
      surf.removeEventListener('touchcancel', onCancel, true);
    };
  }, []);
  return null;
}

Object.assign(window, {
  BSContext, BSProvider, useBS, BSBackButton, BSNavGestures,
  BSPage, BSMasthead, BSMastRow, BSPageHeader, BSAvatar, BSEyebrow, BSSection, BSSlab, BSCell, BSTag, BSRow,
  BSHeadlineNumber, BSTicker, BSHalftone, BSTabBar, BSFooter, BSPhone, BSLogo, BSWordmark, BSPlate,
  DISPLAY_BS, BODY_BS, MONO_BS, makePalette, ShapeUnits,
  // The settings texture picker paints live pattern-preview tiles with this.
  bsMakeTexture: makeTexture,
});
