// PROTOTYPE ONLY (owner, 2026-11-09: "thinking of removing this ticker, what else can we have … for top
// masthead, or top part of home page"). Three ideas for the band under Home's masthead, shown behind
// localStorage `shape.homeTop` = 'a' | 'b' | 'c' | 'none'. Removed once one is picked.
import React from 'react';
import { bsProDeckTheme, bsRaised, BSGlassEdge, bsDeckTeal, BS_DECK_MONO } from './BSProInstrument.jsx';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS } from './bsCleanType.jsx';

export function bsHomeTopIdea() {
  try { const v = window.localStorage.getItem('shape.homeTop'); return ['a', 'b', 'c', 'none'].indexOf(v) >= 0 ? v : null; } catch (e) { return null; }
}

const mono = (size, extra) => ({ fontFamily: BS_DECK_MONO, fontSize: size, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, ...extra });

// A — THE QUOTE: the Shape Score as a stock quote, still: the number, the week's change, the tier ahead.
function IdeaQuote({ t, d, teal, green, score }) {
  const total = score && typeof score.total === 'number' ? score.total : 1284;
  const week = (score && score.week) || '+36';
  const up = !String(week).startsWith('-');
  const tier = (score && score.tier) || 'Tempo';
  const next = (score && score.nextTier) || 'Form';
  const toNext = score && typeof score.pointsToNext === 'number' ? score.pointsToNext : 716;
  const ratio = Math.max(0.04, Math.min(1, score && score.goal ? total / score.goal : 0.64));
  return (
    <section data-glass="" style={{ ...bsRaised(t), margin: '0 10px', padding: '12px 16px 13px', display: 'flex', alignItems: 'flex-end', gap: 14, color: d.INK }}>
      <BSGlassEdge t={t} />
      <div style={{ position: 'relative', flex: '0 0 auto' }}>
        <div style={mono(8.5, { color: d.INK50 })}>Shape score · {tier}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString()}</span>
          <span style={{ ...mono(10, { letterSpacing: '0.06em' }), color: up ? green : '#e98a73' }}>{up ? '▲' : '▼'} {String(week).replace(/^[+-]/, '')} wk</span>
        </div>
      </div>
      <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, textAlign: 'right' }}>
        <div style={mono(8.5, { color: d.INK50 })}><span style={{ color: d.INK }}>{toNext.toLocaleString()}</span> to {next}</div>
        <div style={{ height: 5, borderRadius: 3, background: d.HAIR, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${teal}66, ${teal})` }} />
        </div>
      </div>
    </section>
  );
}

// B — THE GAUGES: the day's four figures as small rings, an instrument cluster.
function Ring({ d, color, ratio, value, label, sub }) {
  const r = 19; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(1, ratio || 0));
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 5, minWidth: 0 }}>
      <div style={{ position: 'relative', width: 46, height: 46 }}>
        <svg width="46" height="46" viewBox="0 0 46 46" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
          <circle cx="23" cy="23" r={r} fill="none" stroke={d.HAIR} strokeWidth="3.5" />
          <circle cx="23" cy="23" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />
        </svg>
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: BS_CLEAN_HEAD, fontSize: 11.5, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
        <div style={mono(8.5, { color: d.INK })}>{label}</div>
        <div style={mono(7.5, { color: d.INK50, letterSpacing: '0.1em' })}>{sub}</div>
      </div>
    </div>
  );
}
function IdeaGauges({ t, d, teal, green, tk, hab }) {
  const cal = tk.cal != null ? tk.cal : 1568; const calT = tk.cal_target || 2100;
  const pro = tk.protein_g != null ? tk.protein_g : 118; const proT = tk.protein_target || 150;
  const hb = hab || { done: 3, total: 5 };
  const slp = tk.sleep_hours != null ? tk.sleep_hours : 7.4;
  const hm = `${Math.floor(slp)}h${String(Math.round((slp % 1) * 60)).padStart(2, '0')}`;
  return (
    <section data-glass="" style={{ ...bsRaised(t), margin: '0 10px', padding: '12px 8px 11px', color: d.INK }}>
      <BSGlassEdge t={t} />
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Ring d={d} color={teal} ratio={cal / calT} value={cal.toLocaleString()} label="Cal" sub={`of ${calT.toLocaleString()}`} />
        <Ring d={d} color={pro >= proT ? green : teal} ratio={pro / proT} value={`${pro}g`} label="Protein" sub={`of ${proT}g`} />
        <Ring d={d} color={hb.done >= hb.total ? green : teal} ratio={hb.total ? hb.done / hb.total : 0} value={`${hb.done}/${hb.total}`} label="Habits" sub="today" />
        <Ring d={d} color={slp >= 7 ? green : '#ffc56a'} ratio={slp / 8} value={hm} label="Sleep" sub="last night" />
      </div>
    </section>
  );
}

// C — THE GREETING: the day said in words, as a front page's lead line, with Nora's one-line brief.
function IdeaGreeting({ t, d, teal, score, hab, name }) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const first = String(name || '').trim().split(/\s+/)[0];
  const total = score && typeof score.total === 'number' ? score.total : 1284;
  const week = (score && score.week) || '+36';
  const hb = hab || { done: 3, total: 5 };
  const left = Math.max(0, hb.total - hb.done);
  return (
    <section style={{ padding: `2px ${t.padX}px 4px`, color: d.INK }}>
      <div style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 27, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
        {part}{first ? <>, <span style={{ color: teal }}>{first}</span></> : null}.
      </div>
      <div style={{ marginTop: 6, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, lineHeight: 1.4, color: d.INK70, display: 'flex', gap: 7, alignItems: 'baseline' }}>
        <span style={{ color: teal, fontSize: 12 }}>✦</span>
        <span>
          <b style={{ color: d.INK, fontWeight: 600 }}>{total.toLocaleString()} pts</b>, {week} this week.{' '}
          {left ? <>{left} habit{left === 1 ? '' : 's'} left today.</> : <>Every habit done today.</>}
        </span>
      </div>
    </section>
  );
}

export function BSHomeTopIdea({ idea, score, tk, hab, name }) {
  const t = window.useBS();
  const d = bsProDeckTheme(t);
  const teal = bsDeckTeal(t);
  const green = t.isLight ? '#2f8a3a' : '#a3e09a';
  const wrap = (el) => <div data-bs-home-top={idea} style={{ marginTop: 2 }}>{el}</div>;
  if (idea === 'a') return wrap(<IdeaQuote t={t} d={d} teal={teal} green={green} score={score} />);
  if (idea === 'b') return wrap(<IdeaGauges t={t} d={d} teal={teal} green={green} tk={tk || {}} hab={hab} />);
  if (idea === 'c') return wrap(<IdeaGreeting t={t} d={d} teal={teal} score={score} hab={hab} name={name} />);
  return null;
}
