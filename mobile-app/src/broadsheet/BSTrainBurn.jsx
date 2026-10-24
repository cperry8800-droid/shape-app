import React from 'react';
import { bsBurnWeek } from '../services/weekBurn.mjs';
import { bsHwIso, bsHwWeekDays, bsHwShift } from '../services/homeWeek.mjs';
// ─── TRAIN · BURNED THIS WEEK ────────────────────────────────────────────────────────────────────
// Owner, 2026-10-24: "lets also add a total calories burned each week appearing below the week
// calendar like eat tab", then "have the calories burned be smaller, different chart type". Train
// draws it under its week strip as one compact card: the week's total, its daily average and where
// the figures come from, beside a line Monday to Sunday (a day nothing tracked is a gap in the
// line, never a dip to 0). The sum is services/weekBurn.mjs (a day counted once); the rows are
// window.ShapeBurn.week.
//
// ⚠ NOTHING TRACKED READS "—", NEVER 0: a member with no watch or app connected is offered one. A
// read that fails says so and can be tried again. Signed out, the preview's sample week is marked.
//
// Window globals are read at call time and the module never imports back into the client module
// (the BSIntegrationsPage / BSLeaderboard pattern).

const { useState, useEffect } = React;

function useShapeTr() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}
const locale = () => window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.() || undefined;
const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const num = (n) => new Intl.NumberFormat(locale()).format(n);

// The preview's week: a sample, fitted to the days that have passed this week.
function bsTbDemoWeek(monday, todayIso) {
  const sample = [540, 380, 620, 0, 455, 710, 300];
  const snaps = sample.map((kcal, i) => ({ snapshot_date: bsHwShift(monday, i), calories: kcal }));
  return bsBurnWeek({ monday, todayIso, snaps });
}

export function BSTrainBurn() {
  const t = window.useBS();
  const tr = useShapeTr();
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const signedIn = !!uid;
  // Today is state, read again each minute and when the app comes back to the front (Codex P2 on
  // #2437): Train left open past midnight moves to the new day, and past Sunday night to the new
  // week, without anything else on the screen changing.
  const [todayIso, setTodayIso] = useState(() => bsHwIso(new Date()));
  useEffect(() => {
    const tick = () => { const next = bsHwIso(new Date()); setTodayIso((cur) => (cur === next ? cur : next)); };
    const timer = setInterval(tick, 60000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const monday = bsHwWeekDays(todayIso)[0];
  const [read, setRead] = useState(null); // { uid, monday, ok, snaps, acts }
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!signedIn) return undefined;
    let on = true;
    const api = window.ShapeBurn?.week;
    (api ? api(monday) : Promise.resolve({ ok: false }))
      .then((r) => { if (on) setRead({ ...(r || { ok: false }), uid, monday }); })
      .catch(() => { if (on) setRead({ ok: false, uid, monday }); });
    return () => { on = false; };
  }, [uid, monday, tries]);
  // A sync or a logged workout reads the week again (Codex P2 on #2437): the card stays mounted
  // under Settings → Integrations, where Connect sends the member. The last read shows meanwhile.
  useEffect(() => {
    const again = () => setTries((n) => n + 1);
    window.addEventListener('shape:activitiesChanged', again);
    return () => window.removeEventListener('shape:activitiesChanged', again);
  }, []);
  // A read is used only for its own account and week: the tab left open across Sunday night reads
  // the new week, and another account never sees the last one's.
  const held = read && read.uid === uid && read.monday === monday ? read : null;
  const week = !signedIn ? bsTbDemoWeek(monday, todayIso) : held && held.ok ? bsBurnWeek({ monday, todayIso, snaps: held.snaps, acts: held.acts }) : null;
  const loading = signedIn && !held;
  const failed = signedIn && held && !held.ok;
  const hasTotal = !!week && week.total != null;
  const range = (() => {
    const f = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });
    try { return f.formatRange(dateOf(monday), dateOf(bsHwShift(monday, 6))); } catch (e) { return `${f.format(dateOf(monday))} – ${f.format(dateOf(bsHwShift(monday, 6)))}`; }
  })();
  const days = week ? week.days : Array.from({ length: 7 }, (_, i) => ({ day: bsHwShift(monday, i), kcal: null, future: bsHwShift(monday, i) > todayIso, isToday: bsHwShift(monday, i) === todayIso }));
  const max = week && week.max ? week.max : 1;
  const sources = week ? week.sources.map((s) => (s === 'manual' ? tr('session:burn.manual', { defaultValue: 'your log' }) : s)).join(' · ') : '';
  const muted = { fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK70 };
  const link = { flexShrink: 0, minHeight: 44, marginBlock: -14, background: 'transparent', border: 0, padding: '0 2px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ACCENT, whiteSpace: 'nowrap' };
  // The line: a point a day with a reading, joined only across neighbouring days.
  const W = 104, H = 40, PAD = 5;
  const x = (i) => PAD + (i * (W - 2 * PAD)) / 6;
  const y = (k) => H - PAD - (k / max) * (H - 2 * PAD - 2);
  const pts = days.map((d, i) => (d.kcal != null ? { i, x: x(i), y: y(d.kcal), today: d.isToday } : null));
  const runs = [];
  pts.forEach((p, i) => { if (!p) return; if (i > 0 && pts[i - 1]) runs[runs.length - 1].push(p); else runs.push([p]); });
  return (
    <section data-train-burn="" aria-busy={loading || undefined} aria-label={tr('session:burn.title', { defaultValue: 'Burned this week' })}
      style={{ margin: `12px ${t.padX}px 0`, padding: '10px 12px 10px 14px', borderRadius: 12, background: t.PAPER2 || t.PAPER, border: t.isLight ? 0 : `1px solid ${t.HAIR}`, display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${W}px`, alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...muted, fontWeight: 800, letterSpacing: '0.16em', color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span aria-hidden style={{ color: t.ACCENT, marginRight: 6 }}>▲</span>{tr('session:burn.title', { defaultValue: 'Burned this week' })}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 22, lineHeight: 1.05, letterSpacing: '-0.02em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{hasTotal ? num(week.total) : '—'}</span>
          <span style={{ fontFamily: t.BODY, fontSize: 12, color: t.INK70 }}>{tr('session:burn.kcalWord', { defaultValue: 'kcal' })}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, minHeight: 14 }}>
          {loading && <span style={muted}>{tr('session:burn.reading', { defaultValue: 'Reading your week…' })}</span>}
          {failed && (
            <>
              <span style={{ ...muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('session:burn.failed', { defaultValue: 'Couldn’t read your activity' })}</span>
              <button type="button" onClick={() => setTries((n) => n + 1)} style={link}>{tr('session:burn.retry', { defaultValue: 'Retry' })} ↻</button>
            </>
          )}
          {week && !hasTotal && (
            <>
              <span style={{ fontFamily: t.BODY, fontSize: 11.5, lineHeight: 1.3, color: t.INK70 }}>{tr('session:burn.none', { defaultValue: 'Nothing tracked yet this week.' })}</span>
              <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openIntegrations')); } catch (e) { /* no listener */ } }} style={link}>{tr('session:burn.connect', { defaultValue: 'Connect' })} →</button>
            </>
          )}
          {hasTotal && (
            <span style={{ ...muted, letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tr('session:burn.avg', { defaultValue: '{avg}/day', avg: num(week.avg) })}
              {(() => { const tail = signedIn ? sources : tr('session:burn.sample', { defaultValue: 'Sample week' }); return tail ? ` · ${tail}` : ''; })()}
            </span>
          )}
        </div>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('session:burn.chartAria', { defaultValue: 'Calories burned each day this week' })} style={{ display: 'block', overflow: 'visible' }}>
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke={t.RULE} strokeWidth="1" />
        {days.map((d, i) => <circle key={d.day} cx={x(i)} cy={H - PAD} r="1.2" fill={d.isToday ? t.ACCENT : t.RULE} />)}
        {runs.map((r, k) => (
          <g key={k}>
            {r.length > 1 && <path d={`M${r[0].x},${H - PAD} ${r.map((p) => `L${p.x},${p.y}`).join(' ')} L${r[r.length - 1].x},${H - PAD} Z`} fill={t.ACCENT} fillOpacity="0.14" />}
            {r.length > 1 && <path d={r.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke={t.ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          </g>
        ))}
        {pts.filter(Boolean).map((p) => <circle key={p.i} cx={p.x} cy={p.y} r={p.today ? 3.5 : 2} fill={t.ACCENT} stroke={p.today ? (t.PAPER2 || t.PAPER) : 'none'} strokeWidth={p.today ? 1.5 : 0} />)}
      </svg>
    </section>
  );
}
