// PROTOTYPE ONLY (owner, 2026-11-09: "thinking of removing this ticker, what else can we have … for top
// masthead, or top part of home page"; of three, "Go with A" (the score quote), then "make the box maybe
// look more unique or just cooler", "less boring"). Three takes on the score quote, shown behind
// localStorage `shape.homeTop` = 'a1' | 'a2' | 'a3' | 'none'. Removed once one is picked.
import React from 'react';
import { bsProDeckTheme, bsRaised, BSGlassEdge, bsDeckTeal, BS_DECK_MONO } from './BSProInstrument.jsx';
import { BS_CLEAN_HEAD } from './bsCleanType.jsx';
import { bsScoreStanding } from '../services/scoreStanding.mjs';

export function bsHomeTopIdea() {
  try { const v = window.localStorage.getItem('shape.homeTop'); return ['a1', 'a2', 'a3', 'none'].indexOf(v) >= 0 ? v : null; } catch (e) { return null; }
}

const mono = (size, extra) => ({ fontFamily: BS_DECK_MONO, fontSize: size, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, ...extra });
const tierColor = (name) => (typeof window !== 'undefined' && window.bsTierColor ? window.bsTierColor(name) : '#d8a23a');

// The figures every take reads: the score, the week's gain and its percent, the tier and the next.
function quoteOf(score, tiers) {
  const total = score && typeof score.total === 'number' ? score.total : 1284;
  const weekN = Number(String((score && score.week) || '+36').replace('+', '')) || 0;
  const tier = (score && score.tier) || 'Tempo';
  const st = bsScoreStanding(tiers, tier, total);
  const before = total - weekN;
  const weekPct = before > 0 ? Math.round((weekN / before) * 1000) / 10 : null;
  return { total, weekN, weekPct, tier, st, color: tierColor(tier), nextColor: tierColor(st.nextName) };
}

// A count up to the figure on first paint (none under reduced motion).
function useCountUp(target, ms = 900) {
  const [v, setV] = React.useState(target);
  React.useEffect(() => {
    let reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (reduce || !(target > 0)) { setV(target); return undefined; }
    let raf = 0; const t0 = performance.now();
    const step = (now) => { const p = Math.min(1, (now - t0) / ms); const e = 1 - Math.pow(1 - p, 3); setV(Math.round(target * e)); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Delta({ q, green, size = 10 }) {
  const up = q.weekN >= 0;
  const c = up ? green : '#e98a73';
  return (
    <span style={{ ...mono(size, { letterSpacing: '0.06em' }), color: c, background: `${c}1f`, border: `1px solid ${c}55`, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {Math.abs(q.weekN)}{q.weekPct != null ? ` · ${Math.abs(q.weekPct)}%` : ''} <span style={{ opacity: 0.7 }}>wk</span>
    </span>
  );
}

// A1 — THE SCOREBOARD: the score in split-flap tiles, a departure board's, over the five-rung ladder.
function Flap({ ch, d, t }) {
  const dark = t.isLight ? '#16140f' : '#0b0a08';
  return (
    <span style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', width: ch === ',' ? 8 : 24, height: 34, borderRadius: 5, background: ch === ',' ? 'transparent' : `linear-gradient(180deg, ${dark} 0%, #23201a 49%, ${dark} 51%, #1c1914 100%)`, boxShadow: ch === ',' ? 'none' : `inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 5px rgba(0,0,0,0.35)${t.isLight ? '' : ', 0 0 0 1px rgba(244,237,224,0.14)'}`, color: ch === ',' ? d.INK : '#f4ede0', fontFamily: BS_CLEAN_HEAD, fontSize: 24, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
      {ch}
      {ch !== ',' ? <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(0,0,0,0.65)', boxShadow: '0 1px 0 rgba(255,255,255,0.06)' }} /> : null}
    </span>
  );
}
function IdeaScoreboard({ t, d, green, q, tiers }) {
  const shown = useCountUp(q.total);
  const chars = shown.toLocaleString().split('');
  return (
    <section data-glass="" style={{ ...bsRaised(t), margin: '0 10px', padding: '12px 14px 12px', color: d.INK }}>
      <BSGlassEdge t={t} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={mono(8.5, { color: d.INK50, marginBottom: 7 })}>Shape score</div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>{chars.map((c, i) => <Flap key={i} ch={c} d={d} t={t} />)}</div>
        </div>
        <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
          <Delta q={q} green={green} />
          <span style={{ ...mono(9), color: q.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, transform: 'rotate(45deg)', borderRadius: 1.5, background: q.color, boxShadow: `0 0 8px ${q.color}` }} />{q.tier}
          </span>
        </div>
      </div>
      {/* The ladder: a segment a rung, the passed ones full, this one filled to the score. */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${tiers.length}, 1fr)`, gap: 4, marginTop: 12 }}>
        {tiers.map((tr, i) => {
          const fill = i < q.st.laneIndex ? 1 : i === q.st.laneIndex ? q.st.frac : 0;
          const c = tierColor(tr.name);
          return <span key={tr.name} style={{ height: 5, borderRadius: 3, background: d.HAIR, overflow: 'hidden' }}><span style={{ display: 'block', width: `${fill * 100}%`, height: '100%', background: c, boxShadow: fill ? `0 0 6px ${c}` : 'none' }} /></span>;
        })}
      </div>
      <div style={{ position: 'relative', ...mono(8, { color: d.INK50, marginTop: 6, display: 'flex', justifyContent: 'space-between' }) }}>
        <span>{q.tier}</span>
        <span>{q.st.topTier ? 'Top tier' : <><span style={{ color: d.INK }}>{q.st.toNext.toLocaleString()}</span> to <span style={{ color: q.nextColor }}>{q.st.nextName}</span></>}</span>
      </div>
    </section>
  );
}

// A2 — THE TIER RING: a glowing arc in the tier's colour, how far to the next rung, beside the score.
function IdeaRing({ t, d, green, q }) {
  const shown = useCountUp(q.total);
  const R = 27; const C = 2 * Math.PI * R; const arc = 0.75; const p = q.st.frac;
  return (
    <section data-glass="" style={{ ...bsRaised(t), margin: '0 10px', padding: '12px 16px 12px 12px', color: d.INK, display: 'flex', alignItems: 'center', gap: 14 }}>
      <BSGlassEdge t={t} />
      <div aria-hidden style={{ position: 'absolute', left: -30, top: -40, width: 170, height: 170, borderRadius: '50%', background: `radial-gradient(circle, ${q.color}${t.isLight ? '33' : '2e'} 0%, transparent 65%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', width: 68, height: 68, flex: '0 0 auto' }}>
        <svg width="68" height="68" viewBox="0 0 68 68" style={{ display: 'block', transform: 'rotate(135deg)', overflow: 'visible' }}>
          <circle cx="34" cy="34" r={R} fill="none" stroke={d.HAIR} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${C * arc} ${C}`} />
          <circle cx="34" cy="34" r={R} fill="none" stroke={q.color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${C * arc * p} ${C}`} style={{ filter: `drop-shadow(0 0 4px ${q.color})` }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 15, fontWeight: 650, lineHeight: 1, letterSpacing: '-0.02em' }}>{q.st.pct}%</div>
            <div style={mono(7, { color: q.color, marginTop: 3, letterSpacing: '0.12em' })}>{q.tier}</div>
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div style={mono(8.5, { color: d.INK50 })}>Shape score</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 3 }}>
          <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 34, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{shown.toLocaleString()}</span>
          <Delta q={q} green={green} size={9} />
        </div>
        <div style={mono(8.5, { color: d.INK50, marginTop: 7 })}>
          {q.st.topTier ? 'Top tier' : <><span style={{ color: d.INK }}>{q.st.toNext.toLocaleString()}</span> to <span style={{ color: q.nextColor }}>{q.st.nextName}</span> →</>}
        </div>
      </div>
    </section>
  );
}

// A3 — THE MARKET CARD: an ink plate in both papers, the score lit in teal over the ladder drawn as a
// rising chart (the rungs as steps, a live dot where the score stands, the climb ahead dashed).
function IdeaMarket({ t, green, teal, q, tiers }) {
  const shown = useCountUp(q.total);
  const W = 150; const H = 52; const n = tiers.length;
  const xOf = (i) => (i / n) * W; const yOf = (i) => H - 6 - (i / (n - 1)) * (H - 14);
  let path = ''; let ahead = '';
  for (let i = 0; i < n; i++) { path += `${i ? 'L' : 'M'}${xOf(i)},${yOf(i)} L${xOf(i + 1)},${yOf(i)} `; }
  const li = q.st.laneIndex; const dx = xOf(li) + (xOf(li + 1) - xOf(li)) * (q.st.topTier ? 1 : q.st.frac); const dy = yOf(li);
  const done = `M0,${yOf(0)} ` + Array.from({ length: li + 1 }, (_, i) => (i < li ? `L${xOf(i + 1)},${yOf(i)} L${xOf(i + 1)},${yOf(i + 1)} ` : `L${dx},${dy}`)).join('');
  ahead = path;
  const ink = '#0f0e0c';
  return (
    <section style={{ position: 'relative', margin: '0 10px', borderRadius: 18, overflow: 'hidden', background: `linear-gradient(160deg, #1b1a16 0%, ${ink} 60%)`, color: '#f4ede0', padding: '12px 14px 12px 17px', boxShadow: t.isLight ? '0 8px 22px rgba(15,14,12,0.22)' : '0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: q.color, boxShadow: `0 0 12px ${q.color}` }} />
      <svg aria-hidden width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', right: 10, bottom: 10, overflow: 'visible' }}>
        <defs><linearGradient id="bsQuoteFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={teal} stopOpacity="0.35" /><stop offset="1" stopColor={teal} stopOpacity="0" /></linearGradient></defs>
        <path d={`${done} L${dx},${H} L0,${H} Z`} fill="url(#bsQuoteFill)" />
        <path d={ahead} fill="none" stroke="rgba(244,237,224,0.18)" strokeWidth="1.2" strokeDasharray="2 3" />
        <path d={done} fill="none" stroke={teal} strokeWidth="1.8" style={{ filter: `drop-shadow(0 0 3px ${teal})` }} />
        <circle cx={dx} cy={dy} r="3.4" fill={teal} style={{ filter: `drop-shadow(0 0 5px ${teal})` }}>
          <animate attributeName="r" values="3.4;4.6;3.4" dur="2.4s" repeatCount="indefinite" />
        </circle>
      </svg>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, ...mono(8.5, { color: 'rgba(244,237,224,0.6)' }) }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: green, boxShadow: `0 0 8px ${green}`, animation: 'bsQuotePulse 2s ease-in-out infinite' }} />
        Shape score <span style={{ color: q.color }}>· {q.tier}</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 6 }}>
        <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 38, fontWeight: 600, letterSpacing: '-0.045em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 18px ${teal}55` }}>{shown.toLocaleString()}</span>
        <span style={{ ...mono(10.5, { letterSpacing: '0.04em' }), color: q.weekN >= 0 ? '#a3e09a' : '#e98a73' }}>{q.weekN >= 0 ? '▲' : '▼'} {Math.abs(q.weekN)}{q.weekPct != null ? ` (${Math.abs(q.weekPct)}%)` : ''} <span style={{ opacity: 0.7 }}>this wk</span></span>
      </div>
      <div style={{ position: 'relative', ...mono(8.5, { color: 'rgba(244,237,224,0.55)', marginTop: 8 }) }}>
        {q.st.topTier ? 'Top tier' : <><span style={{ color: '#f4ede0' }}>{q.st.toNext.toLocaleString()}</span> to <span style={{ color: q.nextColor }}>{q.st.nextName}</span></>}
      </div>
      <style>{'@keyframes bsQuotePulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }'}</style>
    </section>
  );
}

export function BSHomeTopIdea({ idea, score, tiers }) {
  const t = window.useBS();
  const d = bsProDeckTheme(t);
  const teal = bsDeckTeal(t);
  const green = t.isLight ? '#2f8a3a' : '#a3e09a';
  const q = quoteOf(score, tiers);
  const wrap = (el) => <div data-bs-home-top={idea} style={{ marginTop: 2 }}>{el}</div>;
  if (idea === 'a1') return wrap(<IdeaScoreboard t={t} d={d} green={green} q={q} tiers={tiers} />);
  if (idea === 'a2') return wrap(<IdeaRing t={t} d={d} green={green} q={q} />);
  if (idea === 'a3') return wrap(<IdeaMarket t={t} green={green} teal={BS_TEAL_BRIGHT} q={q} tiers={tiers} />);
  return null;
}
const BS_TEAL_BRIGHT = '#34d6c5';
