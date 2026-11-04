import React from 'react';
import { bsBurnWeek } from '../services/weekBurn.mjs';
import { bsHwIso, bsHwWeekDays, bsHwShift } from '../services/homeWeek.mjs';
// ─── TRAIN · BURNED THIS WEEK ────────────────────────────────────────────────────────────────────
// Owner, 2026-10-24: "lets also add a total calories burned each week appearing below the week
// calendar like eat tab", then "i should be able to click on this". Train draws the week as the
// glowing line its day picker rides (BSTrainDay.jsx, owner 2026-11-04: "C for train"): the week's
// total, its daily average and where the figures come from, a day nothing tracked a gap in the line,
// never a dip to 0. It opens the week day by day (BSTrainBurnPage, here): each day's figure, a bar to
// the week's best, and where it came from. The sum is services/weekBurn.mjs (a day counted once); the
// rows are window.ShapeBurn.week, read by useBSBurnWeek below for both.
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

// The week's read, for Train's line (BSTrainDay.jsx) and its page alike: signed out, the preview's
// sample week; signed in, the member's rows for this week, read again on a sync, a logged workout or Retry.
export function useBSBurnWeek() {
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
      <BSDetailHeader onBack={onBack} title={tr('session:burn.title', { defaultValue: 'Burned this week' })} />
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
