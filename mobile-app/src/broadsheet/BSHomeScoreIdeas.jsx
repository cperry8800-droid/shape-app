// PROTOTYPE ONLY (owner, 2026-11-09, of the tier-ring box: "actually i dont love the box", "it doesnt go
// well with shape radio", "what else can we do"). Three ways the score sits with Shape Radio, behind
// localStorage `shape.homeTop` = 'b1' | 'b2' | 'b3' | 'none'. Removed once one is picked.
import React from 'react';
import { BS_DECK_MONO } from './BSProInstrument.jsx';
import { BS_CLEAN_HEAD } from './bsCleanType.jsx';
import { bsScoreQuote, bsScoreQuoteShown } from '../services/scoreStanding.mjs';
import { bsQuoteInk } from './BSHomeScoreQuote.jsx';

export function bsHomeScoreIdea() {
  try { const v = window.localStorage.getItem('shape.homeTop'); return ['b1', 'b2', 'b3', 'none'].indexOf(v) >= 0 ? v : null; } catch (e) { return null; }
}
const CON = { ground: '#0c1413', cream: '#f4ede0', cream60: 'rgba(244,237,224,0.6)', cream40: 'rgba(244,237,224,0.4)', hair: 'rgba(244,237,224,0.12)', teal: '#34d6c5' };
const mono = (size, extra) => ({ fontFamily: BS_DECK_MONO, fontSize: size, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, ...extra });
const tierColor = (n) => (window.bsTierColor ? window.bsTierColor(n) : '#d8a23a');

function Ring({ size, stroke, frac, color, track, glow = true, children }) {
  const r = size / 2 - stroke / 2 - 0.5; const c = 2 * Math.PI * r; const arc = 0.75;
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: '0 0 auto', display: 'inline-block' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', transform: 'rotate(135deg)', overflow: 'visible' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * arc} ${c}`} />
        {frac > 0 ? <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * arc * frac} ${c}`} style={glow ? { filter: `drop-shadow(0 0 3px ${color})` } : null} /> : null}
      </svg>
      {children ? <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</span> : null}
    </span>
  );
}
const pct = (f) => `${Math.round(f * 100)}%`;

// B1 — NO BOX: one slim line on the page's paper, so Shape Radio is the only box up top.
function IdeaLine({ t, q }) {
  const color = bsQuoteInk(tierColor(q.tier), t.isLight);
  const ink50 = `rgba(${t.inkRGB || '15,14,12'},0.55)`;
  const green = t.isLight ? '#2f8a3a' : '#a3e09a';
  return (
    <div style={{ margin: '0 0 0', padding: `2px ${t.padX}px 0`, display: 'flex', alignItems: 'center', gap: 9, color: t.INK }}>
      <Ring size={20} stroke={2.6} frac={q.st.frac} color={color} track={`rgba(${t.inkRGB || '15,14,12'},0.14)`} />
      <span style={mono(8.5, { color: ink50 })}>Score</span>
      <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 16, fontWeight: 650, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{q.total.toLocaleString()}</span>
      {q.weekN ? <span style={mono(8.5, { color: green, letterSpacing: '0.06em' })}>▲ {q.weekN}</span> : null}
      <span style={{ flex: 1 }} />
      <span style={mono(8.5, { color: ink50 })}><span style={{ color }}>{q.tier}</span> · {q.st.toNext.toLocaleString()} to {q.st.nextName} →</span>
    </div>
  );
}

// B2 — THE DRAWER: the score slides out from under Shape Radio's console, the same dark ground, so the two
// read as one unit. (Drawn behind the radio box, filling under its rounded corners.)
export function BSScoreDrawer({ q }) {
  const color = tierColor(q.tier);
  return (
    <div style={{ position: 'relative', zIndex: -1, margin: '-22px 8px 4px', padding: '26px 14px 10px 14px', borderRadius: '0 0 14px 14px', background: `linear-gradient(180deg, #0a1110 0%, ${CON.ground} 40%)`, border: `1px solid ${CON.teal}26`, borderTop: 0, color: CON.cream, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 14px 28px -20px rgba(8,30,28,0.9)' }}>
      <Ring size={24} stroke={3} frac={q.st.frac} color={color} track={CON.hair} />
      <span style={mono(8, { color: CON.cream60 })}>Score <span style={{ color }}>· {q.tier}</span></span>
      <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 17, fontWeight: 650, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{q.total.toLocaleString()}</span>
      {q.weekN ? <span style={mono(8.5, { color: '#a3e09a', letterSpacing: '0.06em' })}>▲ {q.weekN}</span> : null}
      <span style={{ flex: 1 }} />
      <span style={mono(8, { color: CON.cream40 })}><span style={{ color: CON.cream }}>{q.st.toNext.toLocaleString()}</span> to <span style={{ color: tierColor(q.st.nextName) }}>{q.st.nextName}</span> →</span>
    </div>
  );
}

// B3 — THE TWIN CONSOLE: the score in Shape Radio's own console — its dark ground, teal edge and corner
// glow — a matched pair, slimmer than the radio.
function IdeaTwin({ t, q }) {
  const color = tierColor(q.tier);
  return (
    <div style={{ position: 'relative', overflow: 'hidden', margin: '2px 10px 0', borderRadius: 14, background: CON.ground, color: CON.cream, border: `1px solid ${CON.teal}${t.isLight ? '40' : '33'}`, boxShadow: t.isLight ? '0 14px 28px -20px rgba(8,30,28,0.9)' : `0 0 26px -12px ${CON.teal}`, padding: '9px 14px 9px 10px', display: 'flex', alignItems: 'center', gap: 11 }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(130px 90px at 30px 50%, ${color}38, transparent 70%)` }} />
      <Ring size={42} stroke={3.8} frac={q.st.frac} color={color} track={CON.hair}>
        <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 11, fontWeight: 650, color: CON.cream }}>{pct(q.st.frac)}</span>
      </Ring>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div style={mono(8, { color: CON.cream60 })}>Shape score <span style={{ color }}>· {q.tier}</span></div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
          <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{q.total.toLocaleString()}</span>
          {q.weekN ? <span style={mono(9, { color: '#a3e09a', letterSpacing: '0.06em' })}>▲ {q.weekN} wk</span> : null}
        </div>
      </div>
      <span style={{ position: 'relative', ...mono(8, { color: CON.cream40, textAlign: 'right', lineHeight: 1.5 }) }}><span style={{ color: CON.cream }}>{q.st.toNext.toLocaleString()}</span><br />to <span style={{ color: tierColor(q.st.nextName) }}>{q.st.nextName}</span> →</span>
    </div>
  );
}

export function BSHomeScoreIdea({ idea, score, tiers, signedIn }) {
  const t = window.useBS();
  if (!bsScoreQuoteShown(score, { signedIn })) return null;
  const q = bsScoreQuote(score, tiers);
  if (idea === 'b1') return <IdeaLine t={t} q={q} />;
  if (idea === 'b3') return <IdeaTwin t={t} q={q} />;
  return null;
}
export function bsScoreIdeaQuote(score, tiers, signedIn) {
  return bsScoreQuoteShown(score, { signedIn }) ? bsScoreQuote(score, tiers) : null;
}
