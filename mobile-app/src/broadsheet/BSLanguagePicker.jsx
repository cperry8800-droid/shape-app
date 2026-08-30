import React from 'react';
import { activeLocales, resolveLocale } from '../i18n/locales.mjs';
import { useTr } from '../i18n/index.js';

// First-launch language chooser, shown AFTER the wire beat. Lists the wired
// (ACTIVE) locales by their own endonym in a bounded, scrollbar-free scroll
// area, device best-match pinned + pre-selected. "Continue" writes through
// ShapeLocale (localStorage + account mirror) then advances to the membership
// gate. Set in the launch's wire grammar (SHAPE WIRE topbar · mono labels ·
// squared rows · clipped teal CONTINUE) so the whole cold open speaks one
// language — fixed-dark like the other launch surfaces (never the paper theme).
export default function BSLanguagePicker({ onDone }) {
  const { tr } = useTr('onboarding');
  const langs = activeLocales();
  const device = resolveLocale(
    null,
    (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []
  );
  const [sel, setSel] = React.useState(device);
  const ordered = [...langs].sort((a, b) => (a.code === device ? -1 : b.code === device ? 1 : 0));

  const INKF = '#f2ede4', INKF70 = 'rgba(242,237,228,0.7)', INKF50 = 'rgba(242,237,228,0.55)', ACCF = '#34d6c5';
  const mono = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;
  const serif = `'Newsreader', Georgia, serif`;

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.13), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)', color: INKF, display: 'flex', flexDirection: 'column', padding: '52px 20px 24px', zIndex: 40 }}>
      {/* topbar */}
      <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: INKF70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${INKF}`, paddingBottom: 8 }}>
        <span>Shape Wire</span>
        <span style={{ color: INKF }}>{tr('lang.topbar')}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', maxWidth: 360, margin: '0 auto' }}>
        <h1 style={{ fontFamily: serif, fontSize: 27, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '14px 0 0' }}>{tr('lang.title')}</h1>
        <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: INKF50, marginTop: 8 }}>{tr('lang.subtitle')}</div>
        <div className="bs-hide-scroll" style={{ maxHeight: '48vh', overflowY: 'auto', margin: '16px -4px', padding: '2px 4px', display: 'grid', gap: 7, alignContent: 'start' }}>
          {ordered.map((l) => (
            <button
              key={l.code}
              onClick={() => setSel(l.code)}
              aria-pressed={sel === l.code}
              style={{
                textAlign: 'start', padding: '12px 14px', borderRadius: 4, cursor: 'pointer', minHeight: 48,
                display: 'flex', alignItems: 'baseline', gap: 9,
                borderTop: '1px solid transparent', borderRight: '1px solid transparent', borderBottom: `1px solid ${sel === l.code ? 'rgba(52,214,197,0.45)' : 'rgba(242,237,228,0.16)'}`,
                borderLeft: `3px solid ${sel === l.code ? ACCF : 'rgba(242,237,228,0.16)'}`,
                background: sel === l.code ? 'rgba(46,224,196,0.08)' : 'transparent', color: INKF,
              }}
            >
              <span lang={l.code} style={{ fontFamily: serif, fontSize: 16.5, fontWeight: 600, letterSpacing: '-0.01em' }}>{l.nativeName}</span>
              <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: sel === l.code ? ACCF : INKF50 }}>{l.englishName}</span>
            </button>
          ))}
        </div>
        <button
          onClick={async () => { await window.ShapeLocale?.set?.(sel); onDone && onDone(); }}
          className="bs-wire-enter"
          style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)', padding: '14px', border: 0, background: ACCF, color: '#05080c', fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          {tr('common:action.continue')}
        </button>
      </div>
    </div>
  );
}
