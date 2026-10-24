import React from 'react';
import { BSFocusHead } from './BSFocus.jsx';
import { bsBurnWeek } from '../services/weekBurn.mjs';
import { bsHwIso, bsHwWeekDays, bsHwShift } from '../services/homeWeek.mjs';
// ─── TRAIN · BURNED THIS WEEK ────────────────────────────────────────────────────────────────────
// Owner, 2026-10-24: "lets also add a total calories burned each week appearing below the week
// calendar like eat tab". Train draws it under its week strip, as Eat draws Fuel left: the week's
// total, its daily average, a bar a day Monday to Sunday, and where the figures come from. The
// sum is services/weekBurn.mjs (a day counted once); the rows are window.ShapeBurn.week.
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
  const snaps = sample.map((kcal, i) => ({ snapshot_date: bsHwShift(monday, i), calories: kcal, sources: { calories: 'apple_health' } }));
  return bsBurnWeek({ monday, todayIso, snaps });
}

export function BSTrainBurn() {
  const t = window.useBS();
  const tr = useShapeTr();
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const signedIn = !!uid;
  const todayIso = bsHwIso(new Date());
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
  const tint = /^#[0-9a-f]{6}$/i.test(String(t.ACCENT || '')) ? `${t.ACCENT}99` : t.ACCENT;
  const muted = { fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK70 };
  return (
    <>
      <BSFocusHead glyph="▲" top={10} label={tr('session:burn.title', { defaultValue: 'Burned this week' })}
        meta={signedIn ? range : tr('session:burn.sample', { defaultValue: 'Sample week' })} />
      <section data-train-burn="" aria-busy={loading || undefined} style={{ margin: `8px ${t.padX}px 0`, padding: '14px 14px 12px', borderRadius: 16, background: t.PAPER2 || t.PAPER, border: t.isLight ? 0 : `1px solid ${t.HAIR}`, boxShadow: t.isLight ? '0 10px 24px -18px rgba(15,14,12,0.45)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 34, lineHeight: 0.95, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{hasTotal ? num(week.total) : '—'}</span>
          <span style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>{tr('session:burn.kcalWord', { defaultValue: 'kcal burned' })}</span>
          {hasTotal && (
            <span style={{ marginLeft: 'auto', fontFamily: t.BODY, fontSize: 12, color: t.INK70, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {tr('session:burn.avg', { defaultValue: '{avg}/day · {count, plural, one {# day} other {# days}}', avg: num(week.avg), count: week.daysCounted })}
            </span>
          )}
        </div>
        <div role="img" aria-label={tr('session:burn.chartAria', { defaultValue: 'Calories burned each day this week' })} style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
          {days.map((d) => {
            const h = d.kcal != null ? Math.max(4, Math.round((d.kcal / max) * 44)) : 3;
            return (
              <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 5 }}>
                <div style={{ height: 44, display: 'flex', alignItems: 'flex-end' }}>
                  <span style={{ display: 'block', width: '100%', height: h, borderRadius: d.kcal != null ? '4px 4px 1px 1px' : 2, background: d.kcal != null ? (d.isToday ? t.ACCENT : tint) : t.HAIR, opacity: d.future ? 0.5 : 1 }} />
                </div>
                <span style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: d.isToday ? 800 : 700, color: d.isToday ? t.ACCENT : t.INK70 }}>
                  {dateOf(d.day).toLocaleDateString(locale(), { weekday: 'narrow' })}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 20 }}>
          {loading && <span style={muted}>{tr('session:burn.reading', { defaultValue: 'Reading your week…' })}</span>}
          {failed && (
            <>
              <span style={muted}>{tr('session:burn.failed', { defaultValue: 'Couldn’t read your activity' })}</span>
              <button type="button" onClick={() => setTries((n) => n + 1)} style={{ minHeight: 44, marginBlock: -12, background: 'transparent', border: 0, padding: '0 2px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ACCENT }}>{tr('session:burn.retry', { defaultValue: 'Retry' })} ↻</button>
            </>
          )}
          {week && !hasTotal && (
            <>
              <span style={{ fontFamily: t.BODY, fontSize: 12.5, lineHeight: 1.4, color: t.INK70 }}>{tr('session:burn.none', { defaultValue: 'Nothing tracked this week yet. Connect Apple Health, Strava or a watch to count what you burn.' })}</span>
              <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openIntegrations')); } catch (e) { /* no listener */ } }} style={{ flexShrink: 0, minHeight: 44, marginBlock: -10, background: 'transparent', border: 0, padding: '0 2px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ACCENT, whiteSpace: 'nowrap' }}>{tr('session:burn.connect', { defaultValue: 'Connect' })} →</button>
            </>
          )}
          {hasTotal && sources && <span style={muted}>{tr('session:burn.from', { defaultValue: 'From {sources}', sources })}</span>}
        </div>
      </section>
    </>
  );
}
