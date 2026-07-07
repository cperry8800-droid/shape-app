import React from 'react';
import { activeLocales, resolveLocale } from '../i18n/locales.mjs';
import { useTr } from '../i18n/index.js';

// First-launch language chooser, shown AFTER the cosmos splash. Lists the wired
// (ACTIVE) locales by their own endonym in a bounded, scrollbar-free scroll area,
// device best-match pinned + pre-selected. "Continue" writes through ShapeLocale
// (localStorage + account mirror) then advances to the membership gate.
export default function BSLanguagePicker({ onDone }) {
  const { tr } = useTr('onboarding');
  const langs = activeLocales();
  const device = resolveLocale(
    null,
    (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []
  );
  const [sel, setSel] = React.useState(device);
  const ordered = [...langs].sort((a, b) => (a.code === device ? -1 : b.code === device ? 1 : 0));

  // Hide the list scrollbar (webkit + firefox + edge) — scoped, injected once.
  React.useInsertionEffect(() => {
    const id = 'bslp-scroll-css';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = '.bslp-list{scrollbar-width:none;-ms-overflow-style:none}.bslp-list::-webkit-scrollbar{width:0;height:0;display:none}';
    document.head.appendChild(s);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0c0a09', color: '#f4efe6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', zIndex: 40 }}>
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>{tr('lang.title')}</div>
        <div style={{ opacity: 0.6, fontSize: 13, marginTop: 6 }}>{tr('lang.subtitle')}</div>
        <div className="bslp-list" style={{ maxHeight: '48vh', overflowY: 'auto', margin: '16px -4px', padding: '2px 4px', display: 'grid', gap: 8, alignContent: 'start' }}>
          {ordered.map((l) => (
            <button
              key={l.code}
              onClick={() => setSel(l.code)}
              aria-pressed={sel === l.code}
              style={{
                textAlign: 'start', padding: '13px 15px', borderRadius: 12, cursor: 'pointer', minHeight: 48,
                border: `1px solid ${sel === l.code ? '#2ee0c4' : 'rgba(244,239,230,0.16)'}`,
                background: sel === l.code ? 'rgba(46,224,196,0.12)' : 'transparent', color: '#f4efe6',
              }}
            >
              <span lang={l.code} style={{ fontSize: 16, fontWeight: 600 }}>{l.nativeName}</span>
              <span style={{ opacity: 0.5, fontSize: 12, marginInlineStart: 8 }}>{l.englishName}</span>
            </button>
          ))}
        </div>
        <button
          onClick={async () => { await window.ShapeLocale?.set?.(sel); onDone && onDone(); }}
          style={{ padding: '15px', borderRadius: 999, border: 0, background: '#2ee0c4', color: '#0c0a09', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
        >
          {tr('common:action.continue')}
        </button>
      </div>
    </div>
  );
}
