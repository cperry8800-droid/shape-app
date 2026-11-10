import React from 'react';
import { createPortal } from 'react-dom';
import { BSFocusTitle } from './BSFocus.jsx';
import { bsCleanSheet } from './bsCleanType.jsx';
import { bsTrapFocus } from './bsDialogFocus.mjs';

// ─── EAT · COMING UP AND THE MEAL PLAN ────────────────────────────────────────────────────────
// Owner, 2026-11-10, of Eat after Train's On deck and Full plan: "Smaller, app only: add a 'Coming up'
// preview of the next days' meals to Eat, and a pop-up of the full week's meal plan, the same way Train
// now works".
//
// BSEatComingUp: the next three days, each a preview of its menu (the day, Tomorrow, its name, its meals
// and kcal, its first three meals at their times and how many more, its playlists), opening the meal plan
// on that day; Plan opens it on today. As Train's On deck, past Sunday it reads this week's day again, as
// the week repeats, and prints no date.
// BSEatPlanSheet: the week the page shows, every day in full, today framed: the day's name, its meals and
// kcal against its target, the nutritionist's note for it, its playlist, and every meal at its time with
// its macros, the nutritionist's note, its playlist, and what the member did to it (a swap, a meal they
// planned). Month view at its foot still opens the calendar.
//
// It reads nothing and writes nothing: the page (BSClientEat) hands it the week, each day's meals as the
// menu shows them (`mealsOf`: the swaps and the member's own planned meals on), the plan's name and
// nutritionist, and its doors.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (useBS, ShapeI18n), and this module never imports the client.

function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

const locale = () => (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
const weekdayIdx = (d = new Date()) => (d.getDay() + 6) % 7;
function dateOf(idx) {
  const now = new Date();
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(now.getDate() - weekdayIdx(now) + idx);
  return d;
}
function dayName(idx, width) {
  const d = dateOf(idx);
  try { return new Intl.DateTimeFormat(locale(), { weekday: width }).format(d); } catch (e) { return new Intl.DateTimeFormat(undefined, { weekday: width }).format(d); }
}
const GOLD = '#a07a2e';
const mono = (t, size, color, extra) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color, ...extra });
// The playlists a day plays: its own, then its meals', each once.
function playlistsOf(day, meals) {
  const out = [];
  const seen = new Set();
  const take = (p) => {
    if (!p || !p.name) return;
    const k = p.id ? `id:${p.id}` : `name:${String(p.name).trim().toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };
  take(day && day.playlist);
  for (const m of meals || []) take(m && m.playlist);
  return out;
}
// A day's meals and kcal, summed from the meals it shows (the swaps and the member's own meals on), against
// the plan's target when it has one (Codex on #2670): a live plan carries each meal's macros and the day's
// targets but no totals, and a swap changes the sum. A day with no meals keeps its own words.
const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
const fmtN = (n) => { try { return Math.round(n).toLocaleString(locale()); } catch (e) { return String(Math.round(n)); } };
function mealsMeta(tr, day, meals) {
  if (!meals.length) return (day && day.meta) || '';
  const count = tr('nutrition:eat.mealCount', { defaultValue: '{n, plural, one {# meal} other {# meals}}', n: meals.length });
  const kcal = meals.reduce((s, m) => s + num(m && m.kcal), 0);
  if (!(kcal > 0)) return count;
  const target = num(day && day.totals && day.totals.target && day.totals.target.cal);
  return target > 0
    ? tr('nutrition:eat.metaOfTarget', { defaultValue: '{meals} · {kcal} of {target} kcal', meals: count, kcal: fmtN(kcal), target: fmtN(target) })
    : tr('nutrition:eat.metaWithKcal', { defaultValue: '{meals} · {kcal} kcal', meals: count, kcal: fmtN(kcal) });
}
function Chip({ t, p }) {
  return <span data-eat-playlist="" style={{ display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box', padding: '4px 8px', border: `1px solid ${t.ACCENT}66`, borderLeft: `3px solid ${t.ACCENT}`, borderRadius: 3, ...mono(t, 8, t.ACCENT, { letterSpacing: '0.12em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>♪ {p.name}</span>;
}

export function BSEatComingUp({ program = [], mealsOf = null, onPlan }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const week = Array.isArray(program) ? program : [];
  const todayIdx = weekdayIdx();
  const act = (
    <button type="button" data-eat-plan-open="" onClick={() => onPlan && onPlan(null)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', minHeight: 44, marginBottom: -6, background: 'transparent', border: 0, padding: '0 2px', color: t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>{tr('session:train.plan', { defaultValue: 'Plan' })} →</button>
  );
  if (!week.length) return null;
  return (
    <>
      <BSFocusTitle kicker={tr('home:section.thisWeek', { defaultValue: 'This week' })} title={tr('nutrition:eat.comingUp', { defaultValue: 'Coming up' })} right={act} />
      <div data-eat-coming="" style={{ padding: `10px ${t.padX}px 0` }}>
        {[1, 2, 3].map((off, i) => {
          const idx = (todayIdx + off) % 7;
          const d = week[idx] || {};
          const meals = (typeof mealsOf === 'function' ? mealsOf(idx, off) : d.meals) || [];
          const tomorrow = off === 1;
          const lists = playlistsOf(d, meals);
          const meta = mealsMeta(tr, d, meals);
          return (
            <button type="button" key={idx} data-eat-coming-day={idx} onClick={() => onPlan && onPlan(idx)}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '40px 1fr 14px', gap: 12, alignItems: 'start', minHeight: 44, padding: '14px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
              <span data-eat-coming-dow="" style={{ paddingTop: 3, fontFamily: t.HEAD || t.DISPLAY, fontSize: 15, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em', color: tomorrow ? t.ACCENT : t.INK }}>{dayName(idx, 'short')}</span>
              <span style={{ minWidth: 0, display: 'block' }}>
                {tomorrow ? <span style={{ display: 'block', marginBottom: 3, ...mono(t, 8, t.ACCENT, { letterSpacing: '0.16em' }) }}>{tr('home:when.tomorrow', { defaultValue: 'Tomorrow' })}</span> : null}
                <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, lineHeight: 1.2, color: t.INK, letterSpacing: '-0.01em' }}>{d.headline || d.title || '—'}</span>
                {meta ? <span data-eat-coming-meta="" style={{ display: 'block', fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{meta}</span> : null}
                {meals.length > 0 ? (
                  <span data-eat-coming-meals="" style={{ display: 'block', marginTop: 8, paddingLeft: 9, borderLeft: `2px solid ${t.RULE}` }}>
                    {meals.slice(0, 3).map((m, j) => (
                      <span key={j} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 0' }}>
                        <span style={{ flex: 'none', minWidth: 52, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.02em' }}>{m.time || m.tag || ''}</span>
                        <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
                      </span>
                    ))}
                    {meals.length > 3 ? <span style={{ display: 'block', paddingTop: 2, ...mono(t, 8.5, t.INK50, { fontWeight: 700, letterSpacing: '0.1em' }) }}>{tr('session:train.moreMoves', { defaultValue: '+{count} more', count: meals.length - 3 })}</span> : null}
                  </span>
                ) : null}
                {lists.length ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{lists.slice(0, 2).map((p, j) => <Chip key={j} t={t} p={p} />)}</span> : null}
              </span>
              <span aria-hidden="true" style={{ paddingTop: 16, fontFamily: t.MONO, fontSize: 12, color: t.INK50 }}>→</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function BSEatPlanSheet({ program = [], focusIdx = 0, planName = '', coach = null, mealsOf = null, onClose, onMonth = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const week = Array.isArray(program) ? program : [];
  const todayIdx = weekdayIdx();
  const [at, setAt] = React.useState(Number.isInteger(focusIdx) ? focusIdx : todayIdx);
  const bodyRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const dayRefs = React.useRef({});
  const reduced = (() => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } })();
  const go = (idx, smooth = true) => {
    setAt(idx);
    const box = bodyRef.current, el = dayRefs.current[idx];
    if (!box || !el) return;
    const top = Math.max(0, el.offsetTop - 8);
    try { box.scrollTo({ top, behavior: smooth && !reduced ? 'smooth' : 'auto' }); } catch (e) { box.scrollTop = top; }
  };
  // Focus moves in and stays (Tab wraps), Escape closes, and focus returns to what opened it (bsTrapFocus, as
  // Train's full plan; Codex on #2669).
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    go(Number.isInteger(focusIdx) ? focusIdx : todayIdx, false);
    return bsTrapFocus(panelRef.current, () => closeRef.current && closeRef.current());
  }, []);

  const title = tr('nutrition:eat.mealPlan', { defaultValue: 'Meal plan' });
  const whenOf = (idx) => (idx === todayIdx ? tr('home:when.today', { defaultValue: 'Today' })
    : idx === todayIdx + 1 ? tr('home:when.tomorrow', { defaultValue: 'Tomorrow' }) : null);
  const kicker = [planName, coach].filter(Boolean).join(' · ');

  const sheet = (
    <div data-eat-plan-scrim="" onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-eat-plan="" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', height: '92%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: t.PAPER, color: t.INK, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTop: `1px solid ${t.RULE}`, outline: 'none' }}>
        <div style={{ flex: 'none', padding: `16px ${t.padX}px 0` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {kicker ? <div style={mono(t, 9, GOLD, { letterSpacing: '0.2em' })}>{kicker}</div> : null}
              <div style={{ marginTop: 4, fontFamily: t.HEAD || t.DISPLAY, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, color: t.INK }}>{title}<span aria-hidden="true" style={{ color: t.ACCENT }}>.</span></div>
            </div>
            <button type="button" data-eat-plan-close="" onClick={onClose} aria-label={tr('session:train.close', { defaultValue: 'Close' })}
              style={{ flex: 'none', minWidth: 44, minHeight: 44, margin: '-6px -10px 0 0', border: 0, background: 'transparent', color: t.INK70, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
          </div>
          <div role="group" aria-label={title} data-eat-plan-days="" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginTop: 12, paddingBottom: 10, borderBottom: `1px solid ${t.RULE}` }}>
            {week.map((d, idx) => {
              const on = idx === at;
              const empty = !d || !(Array.isArray(d.meals) && d.meals.length);
              return (
                <button key={idx} type="button" data-eat-plan-jump={idx} aria-label={dayName(idx, 'long')} aria-current={on ? 'true' : undefined} onClick={() => go(idx)}
                  style={{ minWidth: 0, minHeight: 48, padding: '4px 0', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? GOLD : idx === todayIdx ? `${GOLD}88` : t.RULE}`, background: on ? GOLD : 'transparent', color: on ? '#ffffff' : empty ? t.INK50 : t.INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{dayName(idx, 'narrow')}</span>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{dateOf(idx).getDate()}</span>
                  <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: 99, background: empty ? 'transparent' : on ? '#ffffff' : GOLD }} />
                </button>
              );
            })}
          </div>
        </div>

        <div ref={bodyRef} className="bs-scroll" data-eat-plan-body="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', paddingLeft: t.padX, paddingRight: t.padX, paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          {week.map((d, idx) => {
            const day = d || {};
            const meals = (typeof mealsOf === 'function' ? mealsOf(idx) : day.meals) || [];
            const when = whenOf(idx);
            const meta = mealsMeta(tr, day, meals);
            return (
              <section key={idx} ref={(el) => { dayRefs.current[idx] = el; }} data-eat-plan-day={idx} aria-label={dayName(idx, 'long')}
                style={{ position: 'relative', padding: `18px 0 18px ${idx === todayIdx ? 12 : 0}px`, borderTop: idx === 0 ? 0 : `1px solid ${t.HAIR || t.RULE}`, borderLeft: idx === todayIdx ? `3px solid ${GOLD}` : 0 }}>
                <div style={mono(t, 9, idx === todayIdx ? GOLD : t.INK50)}>{[dayName(idx, 'short'), dateOf(idx).getDate()].join(' ')}{when ? ` · ${when}` : ''}</div>
                <div style={{ marginTop: 5, fontFamily: t.HEAD || t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: t.INK }}>{day.headline || day.title || ''}</div>
                {meta ? <div data-eat-plan-meta="" style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.04em', color: t.INK50 }}>{meta}</div> : null}
                {day.copy ? <div style={{ marginTop: 6, fontFamily: t.BODY || t.DISPLAY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{day.copy}</div> : null}
                {day.playlist && day.playlist.name ? <div style={{ marginTop: 8 }}><Chip t={t} p={day.playlist} /></div> : null}
                {meals.length > 0 ? (
                  <div data-eat-plan-meals="" style={{ marginTop: 12 }}>
                    {meals.map((m, i) => (
                      <div key={m.id || i} data-eat-plan-meal="" style={{ display: 'grid', gridTemplateColumns: '58px 1fr', gap: 10, alignItems: 'baseline', padding: '10px 0', borderTop: i === 0 ? `1.5px solid ${t.RULE}` : `1px solid ${t.HAIR || t.RULE}` }}>
                        <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, fontWeight: 600, letterSpacing: '0.02em' }}>{m.time || ''}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{m.title}</span>
                          {m.sub ? <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 9, color: t.INK70, letterSpacing: '0.02em' }}>{m.sub}</span> : null}
                          {m._swapped ? <span style={{ display: 'block', marginTop: 3, ...mono(t, 8, t.ACCENT) }}>{tr('nutrition:eat.swapped', { defaultValue: 'SWAPPED' })}</span> : null}
                          {m._own ? <span style={{ display: 'block', marginTop: 3, ...mono(t, 8, t.ACCENT) }}>{tr('nutrition:planDay.yours', { defaultValue: 'Planned by you' })}</span> : null}
                          {m.coachNote ? <span style={{ display: 'block', marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${GOLD}`, fontFamily: t.BODY || t.DISPLAY, fontSize: 12, lineHeight: 1.4, color: t.INK70, fontStyle: 'italic' }}>{m.coachNote}</span> : null}
                          {m.playlist && m.playlist.name ? <span style={{ display: 'block', marginTop: 6 }}><Chip t={t} p={m.playlist} /></span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {onMonth ? (
              <button type="button" data-eat-plan-month="" onClick={onMonth} style={{ flex: 1, minHeight: 46, borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', cursor: 'pointer', ...mono(t, 9.5, t.ACCENT) }}>{tr('home:action.monthView', { defaultValue: 'Month view →' })}</button>
            ) : null}
            <button type="button" onClick={onClose} style={{ flex: 1, minHeight: 46, borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', cursor: 'pointer', ...mono(t, 9.5, t.INK) }}>{tr('session:train.close', { defaultValue: 'Close' })}</button>
          </div>
        </div>
      </div>
    </div>
  );
  const host = (typeof document !== 'undefined' && (document.getElementById('bs-phone-surface') || document.body)) || null;
  return host ? createPortal(bsCleanSheet(t, sheet), host) : bsCleanSheet(t, sheet);
}
