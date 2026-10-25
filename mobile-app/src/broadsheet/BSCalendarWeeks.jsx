import React from 'react';
// ─── CALENDAR · WEEKS (Calendar → Month | Weeks) ─────────────────────────────
// Owner, 2026-10-25, with a screenshot of a running app's plan calendar: "How can we
// incorporate this calendar look into shape app. Just want to have this be an available
// viewing option". The Month | Weeks switch on the Calendar picks it, and the device
// remembers the choice (shape.calendarView).
//
// The month's weeks, Monday to Sunday, one block each: the dates, a This / Last / Next week
// tag, and the week's total (done of planned, and the planned time). A row per day: the
// weekday and date, today in a filled disc, then a card per item with its kind's spine and
// a ✓ once done. A finished workout reads the time it took. A day's meals fold into one
// card, which opens that day in Month (where the day reader lists them). From today on, a
// signed-in day offers ＋ Add.
//
// ⚠ THE CALENDAR MODULE HANDS IN WHAT IT OWNS (the kind colors, the time label, the event
// sheet, the add sheet) AS PROPS, so this file never imports it back. Window globals are
// read at call time, as in BSLeaderboard.

const { useEffect, useRef } = React;

// The i18n translator for this module (the self-contained copy every feature module carries).
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
function calLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}

const pad = (n) => String(n).padStart(2, '0');
// A local calendar date as YYYY-MM-DD (never toISOString: that is the UTC date).
export function bsCalIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The Monday-to-Sunday weeks a month touches: from the Monday on or before the 1st to the
// Sunday on or after its last day. Each week is its seven local dates.
export function bsCalWeeksOf(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const end = new Date(year, month + 1, 0 + ((7 - last.getDay()) % 7));
  const weeks = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)));
  }
  return weeks;
}

// Meals fold into one card a day, and a rest day is not something to finish.
const FOLDED = new Set(['MEAL']);
const UNCOUNTED = new Set(['MEAL', 'REST']);

// A week's total: how many of its items are done, and the time they were planned for.
export function bsCalWeekTotals(items) {
  const counted = items.filter((e) => !UNCOUNTED.has(e.kind));
  return {
    done: counted.filter((e) => e.state === 'done').length,
    total: counted.length,
    minutes: counted.reduce((n, e) => n + (Number(e.dur) > 0 ? Number(e.dur) : 0), 0),
  };
}

export function BSCalendarWeeks({ events, viewYear, viewMonth, todayIso, focusIso, head, accentOf, timeLabel, onOpen, onOpenDay, onAdd = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const weeks = bsCalWeeksOf(viewYear, viewMonth);
  const byDate = {};
  events.forEach((e) => { if (e.date) (byDate[e.date] = byDate[e.date] || []).push(e); });
  Object.values(byDate).forEach((list) => list.sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))));

  // Open on the week of the day in hand (today, the day Home handed in, or the day picked in
  // Month), as the switch keeps the reader's place. Only on arriving: paging months doesn't.
  const focusRef = useRef(null);
  const focusIdx = weeks.findIndex((w) => w.some((d) => bsCalIso(d) === focusIso));
  useEffect(() => {
    const el = focusRef.current;
    if (focusIdx <= 0 || !el || !el.scrollIntoView) return;
    // It lands below BSPage's pinned masthead, measured as the pages that stick under it do
    // (offsetHeight: the text sizes are a CSS zoom, and a rect would count it twice).
    try {
      const mast = document.querySelector('[data-bs-pinned-mast]');
      el.style.scrollMarginTop = `${Math.round((mast && mast.offsetHeight) || 0) + 12}px`;
    } catch (e) { /* no DOM */ }
    el.scrollIntoView({ block: 'start' });
  }, []);

  const thisMonday = (() => { const [y, m, d] = String(todayIso).split('-').map(Number); const td = new Date(y, m - 1, d); return bsCalIso(new Date(y, m - 1, d - ((td.getDay() + 6) % 7))); })();
  const weekTag = (monIso) => {
    if (monIso === thisMonday) return ['this', tr('calendar:weeks.thisWeek', { defaultValue: 'This week' })];
    const [y, m, d] = thisMonday.split('-').map(Number);
    if (monIso === bsCalIso(new Date(y, m - 1, d - 7))) return ['last', tr('calendar:weeks.lastWeek', { defaultValue: 'Last week' })];
    if (monIso === bsCalIso(new Date(y, m - 1, d + 7))) return ['next', tr('calendar:weeks.nextWeek', { defaultValue: 'Next week' })];
    return null;
  };
  const fmtMin = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? tr('calendar:weeks.durHM', { h, m, defaultValue: '{h}h {m}m' }) : tr('calendar:weeks.durM', { m, defaultValue: '{m}m' });
  };
  const fmtSec = (sec) => {
    const s = Math.round(sec);
    if (s >= 3600) return fmtMin(Math.round(s / 60));
    return tr('calendar:weeks.durMS', { m: Math.floor(s / 60), s: s % 60, defaultValue: '{m}m {s}s' });
  };
  const shortDate = (d) => d.toLocaleDateString(calLocale(), { month: 'short', day: 'numeric' });
  // A card's second line: the time it took once done, else when and how long, else its note.
  const detail = (e) => {
    if (e.state === 'done' && e.doneSec) return fmtSec(e.doneSec);
    const when = timeLabel(e);
    const parts = [when && when !== '—' ? when : null, Number(e.dur) > 0 ? fmtMin(Number(e.dur)) : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : (e.sub || '');
  };

  const card = { position: 'relative', minWidth: 0, minHeight: 48, padding: '8px 10px 8px 13px', borderRadius: 6, border: `1px solid ${t.RULE}`, background: t.PAPER2, textAlign: 'left', cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 };
  const spine = (c) => <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c }} />;
  // Two lines before it truncates: "Mid-day check-in" reads whole on a phone's half-width card.
  const title = { fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 13, letterSpacing: '-0.01em', lineHeight: 1.15, color: t.INK, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere' };
  const sub = { fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' };

  return (
    <>
      {head}
      <div style={{ padding: `4px ${t.padX}px 18px`, display: 'grid', gap: 14 }}>
        {weeks.map((days, wi) => {
          const monIso = bsCalIso(days[0]);
          const tag = weekTag(monIso);
          const isThis = tag && tag[0] === 'this';
          const items = days.flatMap((d) => byDate[bsCalIso(d)] || []);
          const tot = bsCalWeekTotals(items);
          return (
            <section key={monIso} ref={wi === focusIdx ? focusRef : undefined}
              aria-label={`${shortDate(days[0])} – ${shortDate(days[6])}`}
              // This week is framed in the accent; the others sit under the house's ink rule.
              style={isThis
                ? { borderRadius: 8, borderTop: `1.5px solid ${teal}`, borderRight: `1.5px solid ${teal}`, borderBottom: `1.5px solid ${teal}`, borderLeft: `1.5px solid ${teal}`, padding: '10px 10px 4px' }
                : { borderRadius: 0, borderTop: `2px solid ${t.INK}`, borderRight: 0, borderBottom: 0, borderLeft: 0, padding: '10px 0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 18, letterSpacing: '-0.025em', lineHeight: 1.1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>
                  {shortDate(days[0])} – {shortDate(days[6])}
                </div>
                {tag && (
                  <span style={{ padding: '3px 8px', borderRadius: 999, border: `1px solid ${isThis ? teal : t.RULE}`, background: isThis ? teal : 'transparent', color: isThis ? t.PAPER : t.INK70, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tag[1]}</span>
                )}
              </div>
              <div style={{ marginTop: 5, marginBottom: 8, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>
                {tot.total
                  ? <>{tr('calendar:weeks.total', { defaultValue: 'Total' })} · <span style={{ color: t.INK }}>{tr('calendar:weeks.doneOf', { done: tot.done, total: tot.total, defaultValue: '{done} of {total} done' })}</span>{tot.minutes ? ` · ${fmtMin(tot.minutes)}` : ''}</>
                  : tr('calendar:weeks.nothingPlanned', { defaultValue: 'Nothing planned' })}
              </div>
              {days.map((d) => {
                const iso = bsCalIso(d);
                const isToday = iso === todayIso;
                const list = byDate[iso] || [];
                const meals = list.filter((e) => FOLDED.has(e.kind));
                const cards = list.filter((e) => !FOLDED.has(e.kind));
                const canAdd = onAdd && iso >= todayIso;
                const dayName = d.toLocaleDateString(calLocale(), { weekday: 'short' });
                return (
                  <div key={iso} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', gap: 10, alignItems: 'center', minHeight: 56, padding: '6px 0', borderTop: `1px solid ${t.HAIR}` }}>
                    <div role="heading" aria-level={3} aria-label={[d.toLocaleDateString(calLocale(), { weekday: 'long', month: 'long', day: 'numeric' }), ...(isToday ? [tr('calendar:aria.today', { defaultValue: 'today' })] : [])].join(', ')}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <span aria-hidden="true" style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: isToday ? teal : t.INK50 }}>{dayName}</span>
                      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', background: isToday ? teal : 'transparent', color: isToday ? t.PAPER : (iso < todayIso ? t.INK50 : t.INK), fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 16, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                      {cards.map((e, i) => {
                        const done = e.state === 'done';
                        const line = detail(e);
                        return (
                          <button key={e.id || `${iso}-${i}`} type="button" onClick={() => onOpen(e)}
                            aria-label={[e.title, line, ...(done ? [tr('calendar:weeks.doneAria', { defaultValue: 'done' })] : [])].filter(Boolean).join(', ')}
                            style={card}>
                            {spine(accentOf(e))}
                            <span style={{ ...title, paddingRight: done ? 18 : 0 }}>{e.title}</span>
                            {line ? <span style={sub}>{line}</span> : null}
                            {done && <span aria-hidden="true" style={{ position: 'absolute', top: 6, right: 6, width: 15, height: 15, borderRadius: '50%', display: 'grid', placeItems: 'center', background: teal, color: t.PAPER, fontSize: 9, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                          </button>
                        );
                      })}
                      {meals.length > 0 && (
                        <button type="button" onClick={() => onOpenDay(d)} style={card}
                          aria-label={`${tr('calendar:weeks.meals', { defaultValue: 'Meal plan' })}, ${tr('calendar:weeks.mealCount', { count: meals.length, defaultValue: '{count, plural, one {# meal} other {# meals}}' })}`}>
                          {spine(accentOf(meals[0]))}
                          <span style={title}>{tr('calendar:weeks.meals', { defaultValue: 'Meal plan' })}</span>
                          <span style={sub}>{tr('calendar:weeks.mealCount', { count: meals.length, defaultValue: '{count, plural, one {# meal} other {# meals}}' })}</span>
                        </button>
                      )}
                      {canAdd && (
                        <button type="button" onClick={() => onAdd(d)}
                          aria-label={tr('calendar:weeks.addOn', { date: shortDate(d), defaultValue: 'Add to {date}' })}
                          style={{ minHeight: 44, padding: '0 6px', border: 0, background: 'transparent', color: t.INK70, cursor: 'pointer', textAlign: 'left', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                          ＋ {tr('calendar:weeks.add', { defaultValue: 'Add' })}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
