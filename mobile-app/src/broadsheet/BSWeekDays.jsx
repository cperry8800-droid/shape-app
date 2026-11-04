import React from 'react';
// ─── THE WEEK, AS DAYS TO PICK — Train's lit tiles, Eat's round days ─────────────────────────────
// The week Monday to Sunday under Train's and Eat's heads, a day to tap for each, Month view at its
// right (owner, 2026-10-11: "also have month view option available here on train and eat pages").
//   · `lit` (Train, the owner's C, 2026-11-04: "C for tainer page but make these glow when day selected
//     like in option b"): seven dark slots in a hairline frame, the letter over the date in mono; the
//     day picked framed and lettered in the accent, washed in it and glowing on dark paper (on light,
//     the wash and frame carry it). Today, when not picked, reads in full ink.
//   · `round` (Eat, the owner's pick, 2026-11-04: "2nd image for fuel left today", of B's strip): the
//     letter over a 36px circle, the day picked filled in the accent and glowing on dark paper, today
//     ringed in it, the rest a hairline circle.
// Both restored on the owner's word (2026-11-04: "no revert training to what i had prior", and of Eat
// "use this again"). A rest day carries a green tick under its date.
// The day letters and names come from Intl in the selected language (they were once English literals
// on both tabs). Window globals are read at call time and this module never imports the client.

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

const tint = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return `rgba(136,136,136,${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const locale = () => (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;

// This week, Monday first: each day's letter, short and full name and date, and which is today.
export function bsWeekDaysOf(now = new Date()) {
  const todayIdx = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - todayIdx);
  const fmt = (o) => { try { return new Intl.DateTimeFormat(locale(), o); } catch (e) { return new Intl.DateTimeFormat(undefined, o); } };
  const narrow = fmt({ weekday: 'narrow' }), short = fmt({ weekday: 'short' }), long = fmt({ weekday: 'long' });
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return { letter: narrow.format(d), short: short.format(d), name: long.format(d), date: d.getDate() };
  });
  return { todayIdx, days };
}

export function BSWeekDays({ look = 'lit', activeIdx, onSelect, restFlags = [], onMonth }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const { todayIdx, days } = bsWeekDaysOf();
  const A = t.ACCENT;
  const monthDoor = onMonth ? (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -12, marginBottom: -4 }}>
      <button type="button" onClick={onMonth} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, background: 'transparent', border: 0, padding: '0 2px', color: A, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>{tr('home:action.monthView', { defaultValue: 'Month view →' })}</button>
    </div>
  ) : null;
  const label = (i, on) => `${days[i].name} ${days[i].date}${on ? `, ${tr('home:aria.selected', { defaultValue: 'selected' })}` : ''}`;
  const restTick = (i) => <span aria-hidden style={{ width: 4, height: 3, borderRadius: 1, background: restFlags[i] ? t.GREEN : 'transparent' }} />;

  if (look === 'round') return (
    <div data-week-strip="round" style={{ padding: `6px ${t.padX}px 2px` }}>
      {monthDoor}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, marginTop: 4 }}>
        {days.map((d, i) => {
          const on = i === activeIdx;
          const today = i === todayIdx;
          return (
            <button type="button" key={i} onClick={() => onSelect && onSelect(i)} aria-label={label(i, on)} aria-pressed={on} data-on={on ? '1' : '0'}
              style={{ minWidth: 0, minHeight: 56, border: 0, background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', padding: 0 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.14em', color: on ? A : t.INK50 }}>{d.letter}</span>
              <span data-day-dot="" style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', boxSizing: 'border-box', background: on ? A : 'transparent', border: on ? 0 : today ? `1.5px solid ${A}` : `1px solid ${tint(t.INK, 0.14)}`, boxShadow: on && !t.isLight ? `0 0 16px -2px ${A}` : 'none', color: on ? (t.isLight ? '#fff' : '#031f1c') : t.INK, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.date}</span>
              {restTick(i)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div data-week-strip="lit" style={{ padding: `6px ${t.padX}px 2px` }}>
      {monthDoor}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginTop: 4 }}>
        {days.map((d, i) => {
          const on = i === activeIdx;
          const today = i === todayIdx;
          return (
            <button type="button" key={i} onClick={() => onSelect && onSelect(i)} aria-label={label(i, on)} aria-pressed={on} data-on={on ? '1' : '0'}
              style={{
                minWidth: 0, height: 54, boxSizing: 'border-box', borderRadius: 9, cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                background: on ? tint(A, t.isLight ? 0.12 : 0.16) : (t.isLight ? tint(t.INK, 0.05) : 'rgba(0,0,0,0.42)'),
                border: `1px solid ${on ? A : tint(t.INK, 0.1)}`,
                boxShadow: on
                  ? (t.isLight ? 'none' : `0 0 16px -2px ${A}, inset 0 0 10px ${tint(A, 0.18)}`)
                  : (t.isLight ? 'inset 0 1px 3px rgba(0,0,0,0.1)' : 'inset 0 1px 4px rgba(0,0,0,0.6)'),
                transition: 'box-shadow .2s ease, background .2s ease',
              }}>
              <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.14em', color: on ? A : t.INK50 }}>{d.letter}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 16, fontWeight: 700, lineHeight: 1, color: on ? A : today ? t.INK : t.INK70, textShadow: on && !t.isLight ? `0 0 10px ${tint(A, 0.8)}` : 'none', fontVariantNumeric: 'tabular-nums' }}>{d.date}</span>
              {restTick(i)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
