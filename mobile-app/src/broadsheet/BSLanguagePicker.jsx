import React from 'react';
import { activeLocales, resolveLocale } from '../i18n/locales.mjs';
import { useTr } from '../i18n/index.js';
import { FR, FR_HEAD, FRScreen, FRHeader, FRPanel, frButton } from './BSFirstRunKit.jsx';

// First-launch language chooser, shown AFTER the wire beat. Lists the wired (ACTIVE) locales by their own
// endonym in a bounded, scrollbar-free scroll area, device best-match pinned + pre-selected. "Continue"
// writes through ShapeLocale (localStorage + account mirror) then advances to the membership gate. Drawn
// in the first-run look (BSFirstRun.jsx, owner 2026-11-13: every screen before the app matches the
// welcome): the centred mark and headline, the choices and Continue in the glass panel. Fixed-dark like
// the other launch surfaces (never the paper theme).
export default function BSLanguagePicker({ onDone }) {
  const { tr } = useTr('onboarding');
  const langs = activeLocales();
  const device = resolveLocale(
    null,
    (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []
  );
  const [sel, setSel] = React.useState(device);
  const ordered = [...langs].sort((a, b) => (a.code === device ? -1 : b.code === device ? 1 : 0));

  return (
    <FRScreen dataAttr={{ 'data-fr-lang': '' }} header={<FRHeader pre={tr('lang.title')} sub={tr('lang.subtitle')} size={32} />}>
      <FRPanel>
        <div role="radiogroup" aria-label={tr('lang.topbar')} className="bs-hide-scroll" style={{ maxHeight: '40vh', overflowY: 'auto', display: 'grid', gap: 6, alignContent: 'start' }}>
          {ordered.map((l) => {
            const on = sel === l.code;
            return (
              <button key={l.code} type="button" role="radio" aria-checked={on} onClick={() => setSel(l.code)}
                style={{
                  textAlign: 'start', minHeight: 50, padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  border: `1px solid ${on ? FR.teal : FR.line}`, background: on ? FR.tealSoft : 'transparent', color: FR.ink,
                }}>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span lang={l.code} style={{ fontFamily: FR_HEAD, fontSize: 16.5, fontWeight: 600 }}>{l.nativeName}</span>
                  <span style={{ fontFamily: FR_HEAD, fontSize: 13, color: FR.ink3 }}>{l.englishName}</span>
                </span>
                <span aria-hidden="true" style={{ flex: 'none', color: FR.teal, fontSize: 16, visibility: on ? 'visible' : 'hidden' }}>✓</span>
              </button>
            );
          })}
        </div>
        <button type="button" data-fr-primary="" onClick={async () => { await window.ShapeLocale?.set?.(sel); onDone && onDone(); }} className="bs-wire-enter" style={frButton('primary')}>
          {tr('common:action.continue')}
        </button>
      </FRPanel>
    </FRScreen>
  );
}
