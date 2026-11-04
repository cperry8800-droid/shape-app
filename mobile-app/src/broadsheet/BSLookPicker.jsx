import React from 'react';
import { BS_LOOK_PAPERS, BS_LOOK_ACCENTS } from '../services/profileCustom.mjs';
import { bsWsLed } from './bsMagazine.mjs';
import { bsRaised } from './BSProInstrument.jsx';

// ─── A PROFILE'S LOOK: the colours picker ─────────────────────────────────────────────────────
// The lit panel the owner picked for the profile editor's Colors page (2026-11-04: "update profile edit
// settings page", then "B for colors"). Three raised plates on the editor's dark chrome:
//   · Start from a Shape look: the presets, each a paper in a dark inset bezel with its accent, the one on
//     framed and lit in the editor's teal, its name in mono under it;
//   · Paper: the pick read in a lit slot ("Paper · Black"), then every paper as an "Aa" swatch in a bezel,
//     lit when picked;
//   · Accent: the pick in a lit slot, then every accent as a lamp in its socket, ringed and glowing in its
//     own colour when picked (black glows teal); under them, whether buttons and text read on that paper.
// The glow is on: the editor's chrome is dark whatever the app's paper. The palette is the app's own
// makePalette, so a swatch is exactly the page it paints. Window globals are read at call time, and the
// module never imports the client.

export const rgbOf = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const lum = (hex) => { const c = rgbOf(hex); if (!c) return 0; const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
export const onColor = (hex) => (lum(hex) > 0.36 ? '#0b0d0c' : '#ffffff');
export const hexA = (hex, a) => { const c = rgbOf(hex); return c ? `rgba(${c.join(',')},${a})` : hex; };
// The palette a look paints: the app's own makePalette, so the preview is exactly the page.
export const paletteOf = (paper, accent) => {
  try { if (window.makePalette) return window.makePalette({ paperMode: paper, accentKey: accent }); } catch (e) {}
  return { PAPER: '#0f0e0c', PAPER2: '#181612', PAPER_BG: '#0f0e0c', INK: '#f5f0e6', inkRGB: '245,240,230', isLight: false, ACCENT: '#34d6c5' };
};
// The accent before makePalette's fallback, to say when it swapped a vanishing accent: [on light, on dark].
export const RAW_ACCENT = { blue: ['#1c4ed8', '#5b8df9'], amber: ['#c8881a', '#e3a544'], rust: ['#a8331b', '#e06547'], green: ['#2f6b3a', '#5fb16e'], teal: ['#0a8f87', '#34d6c5'], violet: ['#6d3fc4', '#a78bfa'], rose: ['#b8285f', '#f2749f'], white: ['#ffffff', '#ffffff'], black: ['#000000', '#000000'] };
// The Shape looks: [key, paper, accent].
export const PRESETS = [['shape', 'dark', 'teal'], ['bone', 'bone', 'rust'], ['blueprint', 'blueprint', 'amber'], ['oxblood', 'oxblood', 'amber'], ['forest', 'forest', 'green'], ['plum', 'plum', 'violet'], ['manila', 'manila', 'black']];

// The editor's chrome: dark, with the editor's teal (BSMakeItYours' own).
const E = { BG: '#0f0e0c', INK: '#f5f0e6', ED: '#34d6c5', WARN: '#e3a544' };
const ea = (n) => `rgba(245,240,230,${n})`;
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const DISPLAY = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
// The chrome as a theme, for the app's lit slot (bsWsLed) and raised plate (bsRaised).
const ET = { isLight: false, INK: E.INK, INK70: ea(0.7), INK50: ea(0.5), PAPER: E.BG, inkRGB: '245,240,230', RULE: ea(0.14) };
const KICKER = { fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: ea(0.6) };
const ELLIPSIS = { minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// The words and the check every Colors page reads.
export function bsLookWords(tr, look) {
  const paperName = (k) => tr('settings:paper.' + k, { defaultValue: k.charAt(0).toUpperCase() + k.slice(1) });
  const accentName = (k) => tr('settings:accent.' + k, { defaultValue: k.charAt(0).toUpperCase() + k.slice(1) });
  const P = paletteOf(look.paper, look.accent);
  const raw = (RAW_ACCENT[look.accent] || RAW_ACCENT.teal)[P.isLight ? 0 : 1];
  const cr = contrast(P.ACCENT, P.PAPER);
  const check = raw.toLowerCase() !== String(P.ACCENT).toLowerCase()
    ? { ok: false, text: tr('profile:mine.checkSwapped', { defaultValue: '{accent} would vanish on {paper}, so your buttons use {fallback}.', accent: accentName(look.accent), paper: paperName(look.paper), fallback: P.ACCENT === '#000000' ? accentName('black') : accentName('white') }) }
    : cr >= 3
      ? { ok: true, text: tr('profile:mine.checkOk', { defaultValue: 'Buttons and text read clearly on {paper}.', paper: paperName(look.paper) }) }
      : { ok: false, text: tr('profile:mine.checkFaint', { defaultValue: '{accent} is faint on {paper}. Try a darker accent.', accent: accentName(look.accent), paper: paperName(look.paper) }) };
  const lookName = ([key, pa]) => (key === 'shape' ? 'Shape' : paperName(pa));
  const accentCol = (k) => (RAW_ACCENT[k] || RAW_ACCENT.teal)[P.isLight ? 0 : 1];
  return { paperName, accentName, P, check, lookName, accentCol };
}

// A preview card set in a raised bezel, as the panel's screen.
export function BSLookBezel({ children, style = null }) {
  return <div data-colors-bezel="" style={{ ...bsRaised(ET), padding: 7, ...(style || {}) }}>{children}</div>;
}

// The PREVIEW tag on that card: a lit slot.
export const bsLookPreviewTag = () => ({ ...bsWsLed(ET, true), background: 'rgba(0,0,0,0.62)', padding: '4px 8px', fontWeight: 800, letterSpacing: '0.16em' });

// `look` is { paper, accent, ... }; `setLook` takes the whole next look (other fields kept).
export function BSLookPicker({ tr, look, setLook }) {
  const { paperName, accentName, check, lookName, accentCol } = bsLookWords(tr, look);
  const plate = { ...bsRaised(ET), padding: '12px 12px 14px', marginTop: 12 };
  const led = (text) => (
    <span data-led="on" style={{ display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box', padding: '6px 10px', fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...bsWsLed(ET, true) }}>{text}</span>
  );
  // A dark inset bezel, framed and glowing in the editor's teal when it is the pick.
  const bezel = (on, ring = E.ED) => ({
    padding: 3, borderRadius: 11, background: 'rgba(0,0,0,0.45)', border: `1px solid ${on ? ring : ea(0.1)}`, boxSizing: 'border-box',
    boxShadow: `inset 0 1px 3px rgba(0,0,0,0.6)${on ? `, 0 0 14px ${hexA(ring, 0.5)}` : ''}`,
  });
  return (
    <div data-look-picker="" style={{ marginTop: 6 }}>
      <div data-colors-plate="looks" style={plate}>
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 26 }}><span style={KICKER}>{tr('profile:mine.startFrom', { defaultValue: 'Start from a Shape look' })}</span></div>
        <div className="bs-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 8px 6px', margin: '2px -8px 0' }}>
          {PRESETS.map((pr) => {
            const [key, pa, ac] = pr;
            const on = pa === look.paper && ac === look.accent, Q = paletteOf(pa, ac);
            return (
              <button key={key} type="button" data-look={key} aria-pressed={on} onClick={() => setLook({ ...look, paper: pa, accent: ac })}
                style={{ flex: 'none', width: 70, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                <span style={{ ...bezel(on), display: 'block', width: 70, height: 50 }}>
                  <span style={{ display: 'flex', width: '100%', height: '100%', borderRadius: 8, background: Q.PAPER_BG, alignItems: 'flex-end', justifyContent: 'flex-end', padding: 5, boxSizing: 'border-box' }}>
                    <span style={{ width: 18, height: 6, borderRadius: 99, background: Q.ACCENT }} />
                  </span>
                </span>
                <span style={{ ...ELLIPSIS, fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: on ? E.ED : ea(0.6), textShadow: on ? `0 0 8px ${hexA(E.ED, 0.8)}` : 'none' }}>{lookName(pr)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div data-colors-plate="paper" style={plate}>
        {led(`${tr('profile:mine.paper', { defaultValue: 'Paper' })} · ${paperName(look.paper)}`)}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 7 }}>
          {BS_LOOK_PAPERS.map((k) => {
            const Q = paletteOf(k, look.accent), on = k === look.paper;
            return (
              <button key={k} type="button" data-paper={k} aria-pressed={on} aria-label={paperName(k)} onClick={() => setLook({ ...look, paper: k })}
                style={{ ...bezel(on), aspectRatio: '1 / 1', minHeight: 44, minWidth: 0, cursor: 'pointer', display: 'block' }}>
                <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: '100%', height: '100%', borderRadius: 8, background: Q.PAPER_BG, color: Q.INK, fontFamily: DISPLAY, fontWeight: 600, fontSize: 13 }}>
                  Aa<span style={{ position: 'absolute', right: 4, bottom: 4, width: 6, height: 6, borderRadius: 99, background: Q.ACCENT }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div data-colors-plate="accent" style={plate}>
        {led(`${tr('profile:mine.accent', { defaultValue: 'Accent' })} · ${accentName(look.accent)}`)}
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', rowGap: 4 }}>
          {BS_LOOK_ACCENTS.map((k) => {
            const on = k === look.accent, col = accentCol(k);
            // A lamp in its socket: lit (ringed and glowing in its own colour) when picked. Black glows teal.
            const ring = lum(col) < 0.02 ? E.ED : col;
            return (
              <button key={k} type="button" data-accent={k} aria-pressed={on} aria-label={accentName(k)} onClick={() => setLook({ ...look, accent: k })}
                style={{ minWidth: 0, height: 52, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <span style={{ width: 44, height: 44, borderRadius: 99, background: 'rgba(0,0,0,0.45)', border: `1px solid ${on ? ring : ea(0.1)}`, boxShadow: `inset 0 1px 3px rgba(0,0,0,0.6)${on ? `, 0 0 14px ${hexA(ring, 0.45)}` : ''}`, display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>
                  <span data-lamp="" style={{ width: 26, height: 26, borderRadius: 99, background: col, border: `1px solid ${ea(0.22)}`, boxSizing: 'border-box', opacity: on ? 1 : 0.85,
                    boxShadow: on ? `0 0 12px ${hexA(ring, 0.85)}, 0 0 3px ${hexA(ring, 0.9)}` : 'inset 0 1px 2px rgba(0,0,0,0.35)' }} />
                </span>
              </button>
            );
          })}
        </div>
        <p role="status" data-look-check={check.ok ? 'ok' : 'warn'} style={{ margin: '10px 0 0', paddingTop: 10, borderTop: `1px solid ${ea(0.1)}`, display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: ea(0.8) }}>
          <span aria-hidden style={{ flex: 'none', marginTop: 5, width: 8, height: 8, borderRadius: 99, background: check.ok ? E.ED : E.WARN, boxShadow: `0 0 8px ${check.ok ? E.ED : E.WARN}` }} />
          {check.text}
        </p>
      </div>
    </div>
  );
}
