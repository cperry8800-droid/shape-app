import React from 'react';
import { createPortal } from 'react-dom';
import { bsCleanSheet } from './bsCleanType.jsx';

// ─── TRAIN · THE FULL PLAN ────────────────────────────────────────────────────────────────────
// Owner, 2026-11-10: "the full plan and on deck just brings you to the monthly calendar page, there
// should be a better preview of what actually is 'on deck' and a pop up of the actual full plan should
// pop up with a better display showing the actual plan".
//
// Train's Full plan, and On deck's Plan and its days, open this sheet: the week the page shows, every
// day in full, today framed in Train's rust. A strip of the seven days jumps to one; each day carries
// its time, length and effort, who wrote it, the coach's brief, its playlist, and its moves as the
// page's own table (N · Move · Scheme · Load) with each move's cue, swaps applied. The month calendar
// stays a door at the foot (Month view).
//
// It reads nothing and writes nothing: the page (BSClientTrain) hands it the week, the moves of each day
// with the member's swaps (`movesOf`), the phase and week, the plan's coach for a day that names none,
// and its two doors. Every word is a catalog key the page already had.
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
// This week's day `idx` (Monday first) as a date.
function dateOf(idx) {
  const now = new Date();
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(now.getDate() - weekdayIdx(now) + idx);
  return d;
}
function dayName(idx, width) {
  const d = dateOf(idx);
  try { return new Intl.DateTimeFormat(locale(), { weekday: width }).format(d); } catch (e) { return new Intl.DateTimeFormat(undefined, { weekday: width }).format(d); }
}
// Display-only, as the page's program table abbreviates it ("3 min rest" → "3m").
const scheme = (s) => String(s || '').replace(/(\d+)\s*min rest/g, '$1m').replace(/(\d+)s rest/g, '$1s');

export function BSTrainPlanSheet({ program = [], focusIdx = 0, weekLabel = '', coach = null, movesOf = null, onClose, onMonth = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const RUST = t.RUST || '#c0533b';
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
  // Open on the day asked for, with focus in the sheet; Escape closes it.
  React.useEffect(() => {
    go(Number.isInteger(focusIdx) ? focusIdx : todayIdx, false);
    try { panelRef.current && panelRef.current.focus({ preventScroll: true }); } catch (e) { /* older engines */ }
    const doc = panelRef.current && panelRef.current.ownerDocument;
    if (!doc) return undefined;
    const key = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    doc.addEventListener('keydown', key);
    return () => doc.removeEventListener('keydown', key);
  }, []);

  const mono = (size, color, extra) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color, ...extra });
  const title = tr('session:train.fullPlan', { defaultValue: 'Full plan' });
  const whenOf = (idx) => (idx === todayIdx ? tr('home:when.today', { defaultValue: 'Today' })
    : idx === todayIdx + 1 ? tr('home:when.tomorrow', { defaultValue: 'Tomorrow' }) : null);

  const sheet = (
    <div data-train-plan-scrim="" onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-train-plan="" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', height: '92%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: t.PAPER, color: t.INK, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTop: `1px solid ${t.RULE}`, outline: 'none' }}>
        {/* The head: phase and week, the title, Close; then the seven days to jump between. */}
        <div style={{ flex: 'none', padding: `16px ${t.padX}px 0` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {weekLabel ? <div style={mono(9, t.ACCENT, { letterSpacing: '0.2em' })}>{weekLabel}</div> : null}
              <div style={{ marginTop: 4, fontFamily: t.HEAD || t.DISPLAY, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, color: t.INK }}>{title}<span aria-hidden="true" style={{ color: t.ACCENT }}>.</span></div>
            </div>
            <button type="button" data-train-plan-close="" onClick={onClose} aria-label={tr('session:train.close', { defaultValue: 'Close' })}
              style={{ flex: 'none', minWidth: 44, minHeight: 44, margin: '-6px -10px 0 0', border: 0, background: 'transparent', color: t.INK70, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
          </div>
          <div role="group" aria-label={title} data-train-plan-days="" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginTop: 12, paddingBottom: 10, borderBottom: `1px solid ${t.RULE}` }}>
            {week.map((d, idx) => {
              const on = idx === at;
              const rest = !d || d.tag === 'REST';
              return (
                <button key={idx} type="button" data-train-plan-jump={idx} aria-label={dayName(idx, 'long')} aria-current={on ? 'true' : undefined} onClick={() => go(idx)}
                  style={{ minWidth: 0, minHeight: 48, padding: '4px 0', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? RUST : idx === todayIdx ? `${RUST}66` : t.RULE}`, background: on ? RUST : 'transparent', color: on ? '#ffffff' : rest ? t.INK50 : t.INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{dayName(idx, 'narrow')}</span>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{dateOf(idx).getDate()}</span>
                  <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: 99, background: rest ? 'transparent' : on ? '#ffffff' : RUST }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Every day of the week, in full */}
        <div ref={bodyRef} className="bs-scroll" data-train-plan-body="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', paddingLeft: t.padX, paddingRight: t.padX, paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          {week.map((d, idx) => {
            const day = d || {};
            const rest = day.tag === 'REST';
            const moves = rest ? [] : (typeof movesOf === 'function' ? movesOf(idx) : (Array.isArray(day.moves) ? day.moves : [])) || [];
            const when = whenOf(idx);
            const head = String(rest ? (day.headline || tr('session:train.activeRest', { defaultValue: 'Active rest' })) : (day.headline || day.title || '')).replace(/\s*\n\s*/g, ' ');
            const by = rest ? null : day.selfAuthored
              ? (day.program && day.program.name ? day.program.name : tr('session:train.programmedByYou', { defaultValue: 'Programmed by you' }))
              : (day.coach || coach) ? `${day.coach || coach} · ${tr('session:train.coachRole', { defaultValue: 'Coach · Trainer' })}` : null;
            return (
              <section key={idx} ref={(el) => { dayRefs.current[idx] = el; }} data-train-plan-day={idx} aria-label={dayName(idx, 'long')}
                style={{ position: 'relative', padding: `18px 0 18px ${idx === todayIdx ? 12 : 0}px`, borderTop: idx === 0 ? 0 : `1px solid ${t.HAIR || t.RULE}`, borderLeft: idx === todayIdx ? `3px solid ${RUST}` : 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={mono(9, idx === todayIdx ? RUST : t.INK50)}>{[dayName(idx, 'short'), dateOf(idx).getDate()].join(' ')}{when ? ` · ${when}` : ''}</span>
                  <span style={{ flex: 1 }} />
                  {!rest && day.timeLabel ? <span style={mono(9, t.INK70, { letterSpacing: '0.06em' })}>{day.timeLabel}</span> : null}
                </div>
                <div style={{ marginTop: 5, fontFamily: t.HEAD || t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: rest ? t.INK70 : t.INK }}>{head}</div>
                {!rest && day.meta ? <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.04em', color: t.INK50 }}>{day.meta}</div> : null}
                {by ? <div style={{ marginTop: 6, ...mono(8.5, t.INK70, { letterSpacing: '0.12em' }) }}>{by}</div> : null}
                {day.copy ? <div style={{ marginTop: 6, fontFamily: t.BODY || t.DISPLAY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{day.copy}</div> : null}
                {!rest && day.playlist && day.playlist.name ? (
                  <div data-train-plan-playlist="" style={{ display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box', marginTop: 8, padding: '5px 9px', border: `1px solid ${t.ACCENT}66`, borderLeft: `3px solid ${t.ACCENT}`, borderRadius: 3, ...mono(8, t.ACCENT, { letterSpacing: '0.12em', overflowWrap: 'anywhere' }) }}>♪ {day.playlist.name}{day.playlist.meta ? ` · ${day.playlist.meta}` : ''}</div>
                ) : null}
                {moves.length > 0 ? (
                  <div data-train-plan-moves="" style={{ marginTop: 12 }}>
                    <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '22px 1fr 84px 48px', gap: 8, paddingBottom: 6, borderBottom: `1.5px solid ${t.RULE}`, ...mono(7.5, t.INK50, { letterSpacing: '0.16em' }) }}>
                      <span>{tr('session:train.col.n', { defaultValue: 'N' })}</span><span>{tr('session:train.col.move', { defaultValue: 'Move' })}</span><span>{tr('session:train.col.scheme', { defaultValue: 'Scheme' })}</span><span style={{ textAlign: 'right' }}>{tr('session:train.col.load', { defaultValue: 'Load' })}</span>
                    </div>
                    {moves.map((r, i) => (
                      <div key={i} data-train-plan-move="" style={{ display: 'grid', gridTemplateColumns: '22px 1fr 84px 48px', gap: 8, alignItems: 'baseline', padding: '9px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR || t.RULE}` }}>
                        <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, fontWeight: 600 }}>{r.n || String(i + 1).padStart(2, '0')}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{r.m}</span>
                          {r.cue ? <span style={{ display: 'block', marginTop: 2, fontFamily: t.BODY || t.DISPLAY, fontSize: 11.5, lineHeight: 1.35, color: t.INK50 }}>{r.cue}</span> : null}
                        </span>
                        <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, letterSpacing: '0.02em', overflowWrap: 'anywhere' }}>{scheme(r.s)}</span>
                        <span style={{ fontFamily: t.MONO, fontSize: 10.5, color: t.INK, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.l}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {onMonth ? (
              <button type="button" data-train-plan-month="" onClick={onMonth} style={{ flex: 1, minHeight: 46, borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.ACCENT, cursor: 'pointer', ...mono(9.5, t.ACCENT) }}>{tr('home:action.monthView', { defaultValue: 'Month view →' })}</button>
            ) : null}
            <button type="button" onClick={onClose} style={{ flex: 1, minHeight: 46, borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', ...mono(9.5, t.INK) }}>{tr('session:train.close', { defaultValue: 'Close' })}</button>
          </div>
        </div>
      </div>
    </div>
  );
  const host = (typeof document !== 'undefined' && (document.getElementById('bs-phone-surface') || document.body)) || null;
  return host ? createPortal(bsCleanSheet(t, sheet), host) : bsCleanSheet(t, sheet);
}
