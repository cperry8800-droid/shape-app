import React from 'react';
import { bsBurnWeek } from '../services/weekBurn.mjs';
import { bsHwIso, bsHwWeekDays, bsHwShift } from '../services/homeWeek.mjs';
// ─── TRAIN · BURNED THIS WEEK ────────────────────────────────────────────────────────────────────
// Owner, 2026-10-24: "lets also add a total calories burned each week appearing below the week
// calendar like eat tab", then "have the calories burned be smaller, different chart type". Train
// draws it under its week strip as one compact row: the week's total, its daily average and where
// the figures come from, beside a line Monday to Sunday (a day nothing tracked is a gap in the
// line, never a dip to 0). The sum is services/weekBurn.mjs (a day counted once); the rows are
// window.ShapeBurn.week.
//
// Owner, 2026-10-24: "i should be able to click on this, also this box doesnt match look of page".
// The row sits on Train's paper between two rules, as the page's other blocks do (no tinted, rounded
// card), and opens the week day by day (BSTrainBurnPage): each day's figure, a bar to the week's
// best, and where it came from.
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

// The week's read, for the row and its page alike: signed out, the preview's sample week; signed in,
// the member's rows for the strip's week, read again on a sync, a logged workout or Retry.
function useBSBurnWeek() {
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
  const days = week ? week.days : Array.from({ length: 7 }, (_, i) => ({ day: bsHwShift(monday, i), kcal: null, future: bsHwShift(monday, i) > todayIso, isToday: bsHwShift(monday, i) === todayIso, from: [] }));
  return {
    signedIn, todayIso, monday, week, days,
    loading: signedIn && !held,
    failed: signedIn && !!held && !held.ok,
    hasTotal: !!week && week.total != null,
    retry: () => setTries((n) => n + 1),
  };
}

const connect = () => { try { window.dispatchEvent(new CustomEvent('shape:openIntegrations')); } catch (e) { /* no listener */ } };
const rangeOf = (monday) => {
  const f = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });
  try { return f.formatRange(dateOf(monday), dateOf(bsHwShift(monday, 6))); } catch (e) { return `${f.format(dateOf(monday))} – ${f.format(dateOf(bsHwShift(monday, 6)))}`; }
};

export function BSTrainBurn({ onOpen = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const { signedIn, week, days, loading, failed, hasTotal, retry } = useBSBurnWeek();
  const max = week && week.max ? week.max : 1;
  const sources = week ? week.sources.map((s) => (s === 'manual' ? tr('session:burn.manual', { defaultValue: 'your log' }) : s)).join(' · ') : '';
  // Train's own colour, the rust of its session spine just below (owner, 2026-10-24, of this card and
  // the session: "improve look of tis"), where the card took the app's teal.
  const c = t.RUST || t.ACCENT;
  const muted = { fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK70 };
  const link = { flexShrink: 0, minHeight: 44, marginBlock: -14, background: 'transparent', border: 0, padding: '0 2px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: c, whiteSpace: 'nowrap' };
  // The line: a point a day with a reading, joined only across neighbouring days.
  const W = 104, H = 40, PAD = 5;
  const x = (i) => PAD + (i * (W - 2 * PAD)) / 6;
  const y = (k) => H - PAD - (k / max) * (H - 2 * PAD - 2);
  const pts = days.map((d, i) => (d.kcal != null ? { i, x: x(i), y: y(d.kcal), today: d.isToday } : null));
  const runs = [];
  pts.forEach((p, i) => { if (!p) return; if (i > 0 && pts[i - 1]) runs[runs.length - 1].push(p); else runs.push([p]); });
  return (
    <section data-train-burn="" aria-busy={loading || undefined} aria-label={tr('session:burn.title', { defaultValue: 'Burned this week' })}
      style={{ margin: `14px ${t.padX}px 0`, borderTop: `1px solid ${t.RULE}`, borderBottom: `1px solid ${t.RULE}` }}>
      {/* The whole row is the door to the week; Retry and Connect sit under it, outside the button. */}
      <button type="button" data-train-burn-open="" onClick={onOpen || undefined} disabled={!onOpen}
        style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${W}px 12px`, alignItems: 'center', gap: 12, width: '100%', minHeight: 44, padding: '12px 0', border: 0, borderRadius: 0, background: 'transparent', textAlign: 'left', cursor: onOpen ? 'pointer' : 'default', font: 'inherit', color: 'inherit' }}>
        <span style={{ display: 'block', minWidth: 0 }}>
          <span style={{ ...muted, display: 'block', fontWeight: 800, letterSpacing: '0.16em', color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span aria-hidden style={{ color: c, marginRight: 6 }}>▲</span>{tr('session:burn.title', { defaultValue: 'Burned this week' })}
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4 }}>
            <span style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 26, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{hasTotal ? num(week.total) : '—'}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK50 }}>{tr('session:burn.kcalWord', { defaultValue: 'kcal' })}</span>
          </span>
          {loading ? <span style={{ ...muted, display: 'block', marginTop: 4 }}>{tr('session:burn.reading', { defaultValue: 'Reading your week…' })}</span> : null}
          {hasTotal ? (
            <span style={{ ...muted, display: 'block', marginTop: 4, letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tr('session:burn.avg', { defaultValue: '{avg}/day', avg: num(week.avg) })}
              {(() => { const tail = signedIn ? sources : tr('session:burn.sample', { defaultValue: 'Sample week' }); return tail ? ` · ${tail}` : ''; })()}
            </span>
          ) : null}
        </span>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('session:burn.chartAria', { defaultValue: 'Calories burned each day this week' })} style={{ display: 'block', overflow: 'visible' }}>
          <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke={t.RULE} strokeWidth="1" />
          {days.map((d, i) => <circle key={d.day} cx={x(i)} cy={H - PAD} r="1.2" fill={d.isToday ? c : t.RULE} />)}
          {runs.map((r, k) => (
            <g key={k}>
              {r.length > 1 && <path d={`M${r[0].x},${H - PAD} ${r.map((p) => `L${p.x},${p.y}`).join(' ')} L${r[r.length - 1].x},${H - PAD} Z`} fill={c} fillOpacity="0.14" />}
              {r.length > 1 && <path d={r.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            </g>
          ))}
          {pts.filter(Boolean).map((p) => <circle key={p.i} cx={p.x} cy={p.y} r={p.today ? 3.5 : 2} fill={c} stroke={p.today ? t.PAPER : 'none'} strokeWidth={p.today ? 1.5 : 0} />)}
        </svg>
        <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 15, fontWeight: 700, color: onOpen ? t.INK50 : 'transparent' }}>›</span>
      </button>
      {failed || (week && !hasTotal) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 12px', minHeight: 14 }}>
          {failed && (
            <>
              <span style={{ ...muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr('session:burn.failed', { defaultValue: 'Couldn’t read your activity' })}</span>
              <button type="button" onClick={retry} style={link}>{tr('session:burn.retry', { defaultValue: 'Retry' })} ↻</button>
            </>
          )}
          {week && !hasTotal && (
            <>
              <span style={{ fontFamily: t.BODY, fontSize: 11.5, lineHeight: 1.3, color: t.INK70 }}>{tr('session:burn.none', { defaultValue: 'Nothing tracked yet this week.' })}</span>
              <button type="button" onClick={connect} style={link}>{tr('session:burn.connect', { defaultValue: 'Connect' })} →</button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

// The week day by day, in the Wall's magazine look: the total over the daily average and how many
// days it counts, then a row a day (its figure, a square bar to the week's best day, where the figure
// came from) under a Saira head on a 2px rule. A day with nothing tracked says so; a day to come too.
export function BSTrainBurnPage({ onBack }) {
  const { BSPage, BSDetailHeader, BSFooter } = window;
  const t = window.useBS();
  const tr = useShapeTr();
  const { signedIn, monday, week, days, loading, failed, hasTotal, retry } = useBSBurnWeek();
  React.useLayoutEffect(() => { const el = document.querySelector('.bs-scroll'); if (el) el.scrollTop = 0; }, []);
  const c = t.RUST || t.ACCENT;
  const max = week && week.max ? week.max : 1;
  const name = (s) => (s === 'manual' ? tr('session:burn.manual', { defaultValue: 'your log' }) : s);
  const mono = { fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK70 };
  const action = { minHeight: 44, padding: '0 14px', border: `1px solid ${t.INK}`, borderRadius: 0, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' };
  const weekday = new Intl.DateTimeFormat(locale(), { weekday: 'long' });
  const short = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });
  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} eyebrow={rangeOf(monday)} title={tr('session:burn.title', { defaultValue: 'Burned this week' })} />
      <section data-train-burn-hero="" aria-busy={loading || undefined} style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{hasTotal ? num(week.total) : '—'}</span>
          <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK50 }}>{tr('session:burn.kcalWord', { defaultValue: 'kcal' })}</span>
        </div>
        {hasTotal ? (
          <div style={{ ...mono, marginTop: 8 }}>
            {tr('session:burn.avg', { defaultValue: '{avg}/day', avg: num(week.avg) })}
            {' · '}{tr('session:burn.page.daysTracked', { defaultValue: '{n} of 7 days tracked', n: week.daysCounted })}
          </div>
        ) : null}
        {hasTotal ? (
          <div style={{ ...mono, marginTop: 4, color: t.INK50 }}>
            {signedIn
              ? (week.sources.length ? tr('session:burn.page.from', { defaultValue: 'From {sources}', sources: week.sources.map(name).join(' · ') }) : '')
              : tr('session:burn.sample', { defaultValue: 'Sample week' })}
          </div>
        ) : null}
        {loading ? <div style={{ ...mono, marginTop: 8 }}>{tr('session:burn.reading', { defaultValue: 'Reading your week…' })}</div> : null}
        {failed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <span style={{ fontFamily: t.BODY, fontSize: 14, color: t.INK70 }}>{tr('session:burn.failed', { defaultValue: 'Couldn’t read your activity' })}</span>
            <button type="button" onClick={retry} style={action}>{tr('session:burn.retry', { defaultValue: 'Retry' })} ↻</button>
          </div>
        ) : null}
        {week && !hasTotal ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.35, color: t.INK70 }}>{tr('session:burn.none', { defaultValue: 'Nothing tracked yet this week.' })}</span>
            <button type="button" onClick={connect} style={{ ...action, background: t.INK, color: t.PAPER, border: 0 }}>{tr('session:burn.connect', { defaultValue: 'Connect' })} →</button>
          </div>
        ) : null}
      </section>

      <section style={{ padding: `${t.sectGap || 28}px ${t.padX}px 0` }}>
        <div data-train-burn-head="" style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 6, borderBottom: `2px solid ${t.INK}` }}>
          <span style={{ flex: 'none', fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, lineHeight: 1, letterSpacing: '0.02em', textTransform: 'uppercase', color: t.INK, whiteSpace: 'nowrap' }}>{tr('session:burn.page.byDay', { defaultValue: 'Day by day' })}</span>
          <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tr('session:burn.kcalWord', { defaultValue: 'kcal' })}</span>
        </div>
        {days.map((d) => {
          const note = d.future ? tr('session:burn.page.toCome', { defaultValue: 'To come' })
            : d.kcal == null ? (week || !signedIn ? tr('session:burn.page.notTracked', { defaultValue: 'Not tracked' }) : '')
            : (d.from || []).map(name).join(' · ');
          return (
            <div key={d.day} data-train-burn-day={d.day} style={{ padding: '12px 0', borderBottom: `1px solid ${t.HAIR}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: d.future ? t.INK50 : t.INK, textTransform: 'capitalize' }}>{weekday.format(dateOf(d.day))}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', color: t.INK50 }}>{short.format(dateOf(d.day))}</span>
                {d.isToday ? <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: c }}>{tr('session:burn.page.today', { defaultValue: 'Today' })}</span> : null}
                <span style={{ marginLeft: 'auto', fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: d.kcal == null ? t.INK50 : t.INK, fontVariantNumeric: 'tabular-nums' }}>{d.kcal == null ? '—' : num(d.kcal)}</span>
              </div>
              <div aria-hidden style={{ marginTop: 8, height: 4, background: t.HAIR }}>
                <div style={{ width: `${d.kcal == null ? 0 : Math.round((d.kcal / max) * 100)}%`, height: '100%', background: c }} />
              </div>
              {note ? <div style={{ ...mono, fontSize: 8.5, marginTop: 6, color: t.INK50 }}>{note}</div> : null}
            </div>
          );
        })}
        <p style={{ margin: '14px 0 0', fontFamily: t.BODY, fontSize: 13, lineHeight: 1.45, color: t.INK70 }}>
          {tr('session:burn.page.rule', { defaultValue: 'A day counts once: a watch’s reading for the whole day, or else the workouts logged that day.' })}
        </p>
      </section>
      <BSFooter />
    </BSPage>
  );
}
