import React from 'react';
import {
  BS_HOURS_DAYS, BS_HOURS_STEP, bsHoursEmpty, bsHoursFromRows, bsHoursProblems, bsHoursValid, bsHoursToRows,
  bsHoursTotal, bsHoursSame, bsHoursCopy, bsHoursClone, bsHoursNextBlock, bsHoursToInput, bsHoursFromInput, bsHoursLabel,
  bsHoursMerge, bsHoursSpan, bsHoursScale, bsHoursRangeWords,
} from '../services/coachHours.mjs';
import { bsProjectAvailability, bsInstantInZone, bsIsZone } from '../services/coachAvailability.mjs';
import { viewerZone, zoneLabel } from '../services/shapeZone.mjs';
import { bsRaised } from './BSProInstrument.jsx';
import { bsMpGlass } from './BSMemberBento.jsx';

// ─── YOUR HOURS (Settings → Your practice → Availability) ────────────────────────────────────
// Owner, 2026-10-27: "make sure coaches calendars/time slots all function properly. Make sure
// coaches have the ability to edit their time slots and customize their availability as they see
// fit." Until now the app had no hours editor at all: the Availability row opened the calendar,
// and hours, time off and booking rules could be set only on the website's Schedule page.
//
// Three stations, each on the same route as the website's, so either editor reads what the other
// saved:
//   Every week     blocks per day (9:00 to 12:00, 14:00 to 18:00), copied across days, saved
//                  together  →  /api/my-availability (the phone's zone rides along: the route
//                  refuses hours it cannot place)
//   Booking rules  the intro's length, notice, a break between sessions, a daily limit, intros
//                  while full; each tap saves that one rule  →  /api/my-booking-rules
//   Time off       whole days or part of one, with a private note  →  /api/my-time-off
//
// THE LOOK (owner, 2026-11-04, of three designs): "I like option C but make it so you can tell more
// specifically what times certain bars sit on, that can be unclear here. And use the bottom part of B
// in C". So the week is C's lit instrument: the week's total in an LED slot with a lamp per open day;
// a lit grid, a row a day, each open half hour lit; the chosen day's times in LED slots under it. Its
// times read: the grid spans the coach's own hours (bsHoursSpan), an hour scale labels them closely
// with a tick and a faint line through every row at each hour, and each row says its ranges in words
// ("9–12 · 2–6") on the reader's clock. Under it, B's half: the rules on glass rows, each value in a
// pill that opens to its choices; time off on a glass card; See your calendar. The coach's colour
// carries the accent (trainers rust, nutritionists gold); the switches stay teal.
//
// ⚠ WHAT MEMBERS SEE IS READ BACK, NOT ASSUMED. Under the week the page lists the next open times
// from the PUBLIC read members get (/api/availability), projected by the same module the listing
// books from, so a coach sees at once whether a change is bookable.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (useBS, BSPage, BSDetailHeader, BSFooter): this file is a
// static import of the client module and evaluates before that module's body runs. It never
// imports the client back.

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

function intlLocale() {
  try { return window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.() || undefined; } catch (e) { return undefined; }
}
// A weekday's short name in the reader's language (2024-01-07 was a Sunday).
function dayShort(wd, locale) {
  try { return new Date(Date.UTC(2024, 0, 7 + wd)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }); } catch (e) { return BS_HOURS_DAYS.find(([d]) => d === wd)[1]; }
}
const teal = (t) => (t.isLight ? '#0a8f87' : '#34d6c5');
const onTeal = (t) => (t.isLight ? '#fff' : '#06231f');
const signedInNow = () => { try { return !!window.ShapeAuth?.getCachedState?.()?.user?.id; } catch (e) { return false; } };
const roleAccent = (role) => (role === 'nutritionist' ? '#a07a2e' : '#c0533b');
const hxA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})` : `rgba(136, 136, 136, ${a})`;
};
// A day's open minutes as a bare figure of hours ("7", "7.5").
const hoursFigure = (min, locale) => { const h = min / 60; try { return h.toLocaleString(locale || undefined, { maximumFractionDigits: 1 }); } catch (e) { return String(Math.round(h * 10) / 10); } };

// The sample a signed-out preview shows, and says it is one.
const PREVIEW_ROWS = [1, 2, 3, 4, 5].flatMap((wd) => [{ weekday: wd, start_minute: 540, duration_min: 180 }, { weekday: wd, start_minute: 840, duration_min: 240 }]);

// ── The instrument's parts ───────────────────────────────────────────────────────────────────
// The LED slot (the Library's and the grocery list's grammar): a dark inset slot on the dark paper and
// a faint ink wash on the light one, a 1px frame tinted to the coach's colour (stronger when lit).
function hoursLed(t, c, on = true) {
  return {
    boxSizing: 'border-box', borderRadius: 8,
    background: t.isLight ? hxA(t.INK, 0.05) : 'rgba(0,0,0,0.45)',
    border: `1px solid ${on ? hxA(c, 0.6) : hxA(t.INK, 0.14)}`,
    boxShadow: t.isLight ? 'inset 0 1px 3px rgba(0,0,0,0.12)' : `inset 0 1px 4px rgba(0,0,0,0.6)${on ? `, 0 0 12px ${hxA(c, 0.2)}` : ''}`,
  };
}
const hoursGlow = (t, c, a = 0.75) => (t.isLight ? {} : { textShadow: `0 0 10px ${hxA(c, a)}` });
// A string's figures large and its words small: the LED readout of "35 hours a week", in any language.
function LedFigures({ t, text, c, big = 30 }) {
  return String(text || '').split(/(\d+(?:[.,]\d+)?)/).filter(Boolean).map((part, i) => (/^\d/.test(part)
    ? <span key={i} style={{ fontFamily: t.MONO, fontSize: big, fontWeight: 700, lineHeight: 1, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', color: c, ...hoursGlow(t, c) }}>{part}</span>
    : <span key={i} style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70 || t.INK50, whiteSpace: 'pre' }}>{part}</span>));
}

function Switch({ t, on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ flex: 'none', width: 52, height: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
      <span aria-hidden style={{ position: 'relative', width: 40, height: 24, borderRadius: 99, background: on ? teal(t) : t.RULE, transition: 'background 160ms' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 18, height: 18, borderRadius: 99, background: on ? onTeal(t) : t.PAPER, transition: 'left 160ms' }} />
      </span>
    </button>
  );
}

// A section's head: a lit square and the words in mono capitals.
function HoursHead({ t, accent, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 26 }}>
      <span aria-hidden style={{ flex: 'none', width: 6, height: 6, borderRadius: 2, background: accent, boxShadow: t.isLight ? 'none' : `0 0 8px ${hxA(accent, 0.9)}` }} />
      <span style={{ flex: 1, minWidth: 0, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70 || t.INK }}>{children}</span>
    </div>
  );
}

function Chip({ t, on, onClick, children, disabled }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      style={{ minHeight: 44, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? teal(t) : t.RULE}`, background: on ? `${teal(t)}22` : 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: on ? 600 : 400, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

function Note({ t, children, tone, style }) {
  const color = tone === 'err' ? (t.RUST || '#c0533b') : tone === 'ok' ? teal(t) : t.INK70 || t.INK50;
  return <div role={tone ? 'status' : undefined} style={{ fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.45, color, ...style }}>{children}</div>;
}

// A time in its LED slot. The whole time reads, AM/PM included (owner, 2026-10-31: "these times are
// cut off"): the app's narrower face with even digits, not the mono, and little padding around it.
// A time marked wrong takes a red frame.
function TimeInput({ t, accent, value, onChange, label, invalid }) {
  return (
    <input type="time" step={BS_HOURS_STEP * 60} aria-label={label} value={bsHoursToInput(value)}
      onChange={(e) => { const m = bsHoursFromInput(e.target.value); if (m != null) onChange(m); }}
      style={{ ...hoursLed(t, accent, true), ...(invalid ? { border: `1px solid ${t.RUST || '#c0533b'}` } : {}), minWidth: 0, flex: 1, minHeight: 44, padding: '0 6px 0 10px', color: t.isLight ? t.INK : accent, colorScheme: t.isLight ? 'light' : 'dark', fontFamily: t.DISPLAY, fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600, outline: 'none', ...hoursGlow(t, accent, 0.55) }} />
  );
}

// ── Every week ────────────────────────────────────────────────────────────────────────────────
// The week's edits: a day switched off remembers its blocks, so switching it back on restores them;
// a copy goes from one day to Weekdays, Weekend or Every day.
function useWeekModel({ tr, days, setDays, disabled }) {
  const locale = intlLocale();
  const closedMemo = React.useRef({});
  const [copyFrom, setCopyFrom] = React.useState(1);
  const problemText = {
    order: tr('coach:hours.problemOrder', { defaultValue: 'Ends before it starts.' }),
    short: tr('coach:hours.problemShort', { defaultValue: 'Make it at least 15 minutes.' }),
    overlap: tr('coach:hours.problemOverlap', { defaultValue: 'Runs into the hours above.' }),
  };
  const setDay = (wd, blocks) => { const next = bsHoursClone(days); next[wd] = blocks; setDays(next); };
  const dayMin = (blocks) => { const one = bsHoursEmpty(); one[0] = blocks; return bsHoursTotal(one); };
  const dayTotal = (blocks) => {
    const min = dayMin(blocks), h = Math.floor(min / 60), m = min % 60;
    return m ? tr('coach:hours.totalHm', { defaultValue: '{h} h {m} min', h, m }) : tr('coach:hours.totalH', { defaultValue: '{h, plural, one {# hour} other {# hours}}', h });
  };
  const toggle = (wd, on) => {
    if (disabled) return;
    const blocks = days[wd] || [];
    if (on) setDay(wd, closedMemo.current[wd] && closedMemo.current[wd].length ? closedMemo.current[wd] : [bsHoursNextBlock([])]);
    else { closedMemo.current[wd] = blocks; setDay(wd, []); }
  };
  const setTime = (wd, i, k, m) => { if (disabled) return; const next = (days[wd] || []).map((x) => x.slice()); next[i][k] = m; setDay(wd, next); };
  const remove = (wd, i) => { if (disabled) return; setDay(wd, (days[wd] || []).filter((_, j) => j !== i)); };
  const add = (wd) => { const blocks = days[wd] || []; const nb = bsHoursNextBlock(blocks); if (nb && !disabled) setDay(wd, [...blocks.map((x) => x.slice()), nb]); };
  const name = (wd) => dayShort(wd, locale);
  const longName = (wd) => { try { return new Date(Date.UTC(2024, 0, 7 + wd)).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' }); } catch (e) { return name(wd); } };
  return {
    locale, problemText, dayMin, dayTotal, toggle, setTime, remove, add, name, longName, copyFrom, setCopyFrom,
    copyTo: (k) => { if (!disabled) setDays(bsHoursCopy(days, copyFrom, k)); },
    targets: [['weekdays', tr('coach:hours.weekdays', { defaultValue: 'Weekdays' })], ['weekend', tr('coach:hours.weekend', { defaultValue: 'Weekend' })], ['all', tr('coach:hours.everyDay', { defaultValue: 'Every day' })]],
    closed: tr('coach:hours.closed', { defaultValue: 'Closed' }),
    openLabel: (wd) => tr('coach:hours.openDay', { defaultValue: 'Open on {day}', day: name(wd) }),
  };
}

// One day's times to edit, in LED slots: from / to, ×, and ＋ Add hours.
function DayRanges({ t, tr, m, wd, blocks, accent }) {
  const problems = bsHoursProblems(blocks);
  const name = m.name(wd);
  const nextBlock = bsHoursNextBlock(blocks);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {blocks.map((b, i) => (
        <div key={i} data-hours-range={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TimeInput t={t} accent={accent} value={b[0]} invalid={!!problems[i]} label={tr('coach:hours.fromLabel', { defaultValue: '{day}, from', day: name })} onChange={(v) => m.setTime(wd, i, 0, v)} />
            <span style={{ flex: 'none', color: t.INK50, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tr('coach:hours.to', { defaultValue: 'to' })}</span>
            <TimeInput t={t} accent={accent} value={b[1]} invalid={!!problems[i]} label={tr('coach:hours.toLabel', { defaultValue: '{day}, until', day: name })} onChange={(v) => m.setTime(wd, i, 1, v)} />
            <button type="button" aria-label={tr('coach:hours.removeBlock', { defaultValue: 'Remove {from} to {to}', from: bsHoursLabel(b[0], m.locale), to: bsHoursLabel(b[1], m.locale) })}
              onClick={() => m.remove(wd, i)}
              // A full 44 × 44 target that reaches into the plate's padding, so the time slots keep the
              // width to read whole (Codex on #2535).
              style={{ flex: 'none', width: 44, height: 44, marginRight: -10, padding: 0, border: 0, background: 'transparent', color: t.INK50, fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
          {problems[i] ? <Note t={t} tone="err" style={{ fontSize: 12.5, marginTop: 4 }}>{m.problemText[problems[i]]}</Note> : null}
        </div>
      ))}
      {nextBlock ? (
        <button type="button" data-hours-add="" onClick={() => m.add(wd)} style={{ alignSelf: 'flex-start', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ ...hoursLed(t, accent, true), padding: '8px 12px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, ...hoursGlow(t, accent, 0.6) }}>＋ {tr('coach:hours.addBlock', { defaultValue: 'Add hours' })}</span>
        </button>
      ) : null}
    </div>
  );
}

// Copy [day ▾] to, then Weekdays · Weekend · Every day on a line of their own.
function CopyRow({ t, tr, m, accent }) {
  const word = { fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 || t.INK50 };
  return (
    <div role="group" aria-label={tr('coach:hours.copyAria', { defaultValue: 'Copy a day' })} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <span style={word}>{tr('coach:hours.copy', { defaultValue: 'Copy' })}</span>
      <select aria-label={tr('coach:hours.copyFrom', { defaultValue: 'Copy from' })} value={m.copyFrom} onChange={(e) => m.setCopyFrom(Number(e.target.value))}
        style={{ ...hoursLed(t, accent, false), minHeight: 44, padding: '0 10px', color: t.INK, colorScheme: t.isLight ? 'light' : 'dark', fontFamily: t.MONO, fontSize: 12, fontWeight: 700 }}>
        {BS_HOURS_DAYS.map(([wd]) => <option key={wd} value={wd}>{m.name(wd)}</option>)}
      </select>
      <span style={word}>{tr('coach:hours.copyTo', { defaultValue: 'to' })}</span>
      {/* The three targets on a line of their own, the full width: each word reads whole, and one a
          language makes longer wraps inside its 44px target instead of being cut. */}
      <div style={{ flex: '1 1 100%', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {m.targets.map(([k, lbl]) => (
          <button key={k} type="button" data-hours-copy={k} onClick={() => m.copyTo(k)}
            style={{ ...hoursLed(t, accent, false), minWidth: 0, minHeight: 44, padding: '5px 6px', cursor: 'pointer', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.15, textAlign: 'center', color: t.INK70 || t.INK50, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

// The day slot's least width, the gap after it, and the plate's inner width at 390 (the page's padding
// and the plate's off it), which the bars' width is read from until the scale has been measured.
const DAY_W = 54;
const DAY_GAP = 8;
const PLATE_W_390 = 322;
// The mono face (JetBrains Mono) advances 0.6em a character; `ls` is the letter-spacing in em.
const monoW = (s, px, ls = 0) => Array.from(String(s).normalize('NFC').replace(/\p{M}/gu, '')).length * px * (0.6 + ls);

// The hour scale over the grid: a label on every hour that fits (bsHoursScale), a tick at every hour.
function HourScale({ t, accent, span, scale, refEl, dayW }) {
  const [lo, hi] = span;
  const pct = (m) => `${((m - lo) / ((hi - lo) || 60)) * 100}%`;
  const labelled = new Set(scale.labels.map((l) => l.at));
  return (
    <div data-hours-scale={`${lo}-${hi}`} data-hours-step={scale.step} aria-hidden style={{ margin: `12px 0 2px ${dayW + DAY_GAP}px`, position: 'relative', height: 19 }}>
      <div ref={refEl} style={{ position: 'absolute', inset: 0 }} />
      {scale.labels.map((l, i) => {
        // The last label hangs right only if it would run past the plate's padding.
        const endHang = l.at === hi && l.text.length * 5.5 > 22;
        return (
          <span key={l.at} data-hours-mark={l.at} style={{ position: 'absolute', top: 0, left: pct(l.at), transform: endHang ? 'translateX(-100%)' : 'translateX(-50%)', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', lineHeight: '11px', color: i === 0 || /\D/.test(l.text) ? (t.INK70 || t.INK) : t.INK50, whiteSpace: 'nowrap' }}>{l.text}</span>
        );
      })}
      {scale.ticks.map((m) => (
        <span key={m} data-hours-tick={m} style={{ position: 'absolute', bottom: 0, left: pct(m), width: 1, marginLeft: -0.5, height: labelled.has(m) ? 5 : 3, background: labelled.has(m) ? hxA(t.INK, 0.45) : hxA(t.INK, 0.28) }} />
      ))}
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: hxA(accent, 0.22) }} />
    </div>
  );
}

// The week as a lit grid, with its readout and the chosen day under it.
function WeekGrid({ t, tr, days, setDays, disabled, accent, perWeek }) {
  const m = useWeekModel({ tr, days, setDays, disabled });
  const [sel, setSel] = React.useState(() => new Date().getDay());
  // The copy starts from the day in view; its picker still takes any day.
  React.useEffect(() => { m.setCopyFrom(sel); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each day slot reads its name and its figure whole ("MON 7", "THỨ 2 11.5"): the slots take the
  // widest the week needs, 54px at least, and all share it so every row's bars line up with the scale.
  const figure = (bl) => (bl.length ? hoursFigure(m.dayMin(bl), m.locale) : '–');
  const dayW = Math.max(DAY_W, Math.ceil(Math.max(...BS_HOURS_DAYS.map(([wd]) => monoW(m.name(wd), 8.5, 0.08) + monoW(figure(days[wd] || []), 13, 0.02) + 6 + 14))));
  // The scale's labels are as close as its measured width allows (390 wide until it is measured). It is
  // read after every render (a wider day slot narrows it) and again whenever it resizes with no render
  // (a phone turned, a window narrowed), so the labels never keep a width they no longer have.
  const scaleRef = React.useRef(null);
  const [measured, setMeasured] = React.useState(0);
  const readScale = React.useCallback(() => {
    const el = scaleRef.current;
    const w = el && el.getBoundingClientRect ? el.getBoundingClientRect().width : 0;
    if (w > 0) setMeasured((was) => (Math.abs(w - was) > 1 ? w : was));
  }, []);
  React.useLayoutEffect(readScale);
  React.useEffect(() => {
    const el = scaleRef.current;
    const RO = window.ResizeObserver;
    if (el && typeof RO === 'function') {
      const ro = new RO(readScale);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', readScale);
    return () => window.removeEventListener('resize', readScale);
  }, [readScale]);
  const barsW = measured || PLATE_W_390 - dayW - DAY_GAP;
  const span = bsHoursSpan(days);
  const [lo, hi] = span;
  const scale = bsHoursScale(span, { width: barsW, locale: m.locale });
  const cells = Math.max(1, Math.round((hi - lo) / 30));
  const pct = (x) => `${((x - lo) / ((hi - lo) || 60)) * 100}%`;
  const blocks = days[sel] || [];
  const open = blocks.length > 0;
  const off = t.isLight ? hxA(t.INK, 0.07) : 'rgba(255,255,255,0.05)';
  const line = hxA(t.INK, t.isLight ? 0.2 : 0.16);
  return (
    <div style={{ ...bsRaised(t, accent), padding: 12 }}>
      {/* The readout: the week's total, and a lamp per open day. */}
      <div data-hours-total="" style={{ ...hoursLed(t, accent, true), minHeight: 56, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 2 }}><LedFigures t={t} text={perWeek} c={accent} /></span>
        <span aria-hidden style={{ flex: 'none', display: 'flex', gap: 3 }}>
          {BS_HOURS_DAYS.map(([wd]) => {
            const lit = (days[wd] || []).length > 0;
            return <span key={wd} data-hours-lamp={lit ? 'on' : 'off'} style={{ width: 5, height: 16, borderRadius: 2, background: lit ? accent : off, boxShadow: lit && !t.isLight ? `0 0 6px ${hxA(accent, 0.8)}` : 'none' }} />;
          })}
        </span>
      </div>
      <HourScale t={t} accent={accent} span={span} scale={scale} refEl={scaleRef} dayW={dayW} />
      {BS_HOURS_DAYS.map(([wd]) => {
        const bl = days[wd] || [];
        const merged = bsHoursMerge(bl);
        const isOpen = bl.length > 0;
        const on = sel === wd;
        const words = bsHoursRangeWords(bl, m.locale);
        const said = merged.map(([s, e]) => `${bsHoursLabel(s, m.locale)} – ${bsHoursLabel(e, m.locale)}`).join(', ');
        return (
          <button key={wd} type="button" data-hours-day={wd} aria-pressed={on} aria-label={`${m.name(wd)}, ${isOpen ? m.dayTotal(bl) : m.closed}${said ? `: ${said}` : ''}`} onClick={() => setSel(wd)}
            style={{ width: '100%', minHeight: 44, padding: '3px 0', display: 'flex', alignItems: 'center', gap: DAY_GAP, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
            <span data-hours-slot="" style={{ ...hoursLed(t, accent, on), flex: 'none', width: dayW, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '0 7px', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? accent : isOpen ? (t.INK70 || t.INK) : t.INK50 }}>{m.name(wd)}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', color: on ? accent : isOpen ? t.INK : (t.INK30 || t.INK50), ...(on ? hoursGlow(t, accent) : {}) }}>{figure(bl)}</span>
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Each half hour a cell, lit where the day is open; a faint line at every hour of the
                  scale, in the gap between two cells, so a bar's ends read against the labels. */}
              <span aria-hidden data-hours-bars="" style={{ position: 'relative', height: 18, display: 'flex' }}>
                {Array.from({ length: cells }, (_, ci) => {
                  const a = lo + ci * 30, b = a + 30;
                  const lit = merged.some(([s, e]) => Math.min(e, b) - Math.max(s, a) >= 15);
                  return (
                    <span key={ci} data-hours-cell={a} data-lit={lit ? '1' : '0'} style={{ flex: 1, minWidth: 0, padding: '0 1px', boxSizing: 'border-box', display: 'flex' }}>
                      <span style={{ flex: 1, borderRadius: 2.5, background: lit ? accent : off, opacity: lit && !on ? 0.8 : 1, boxShadow: lit ? (t.isLight ? 'none' : `0 0 ${on ? 8 : 5}px ${hxA(accent, on ? 0.85 : 0.55)}`) : (t.isLight ? 'inset 0 1px 1px rgba(0,0,0,0.08)' : 'inset 0 1px 2px rgba(0,0,0,0.6)') }} />
                    </span>
                  );
                })}
                {scale.ticks.map((h) => <span key={h} data-hour-line={h} style={{ position: 'absolute', top: -3, bottom: -2, left: pct(h), width: 1, marginLeft: -0.5, background: line, pointerEvents: 'none' }} />)}
              </span>
              <span data-hours-words="" style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: on ? 700 : 600, letterSpacing: '0.04em', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', color: !isOpen ? t.INK50 : on ? accent : (t.INK70 || t.INK), overflowWrap: 'anywhere' }}>{isOpen ? words : m.closed}</span>
            </span>
          </button>
        );
      })}
      {/* The chosen day: its switch, its times in LED slots, the copy. */}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${hxA(t.INK, 0.1)}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span data-hours-chosen={sel} style={{ fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, ...hoursGlow(t, accent, 0.6) }}>{m.longName(sel)}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.06em', color: t.INK50 }}>{open ? m.dayTotal(blocks) : m.closed}</span>
          </span>
          <Switch t={t} on={open} label={m.openLabel(sel)} onChange={(v) => m.toggle(sel, v)} />
        </div>
        {open ? <DayRanges t={t} tr={tr} m={m} wd={sel} blocks={blocks} accent={accent} /> : null}
        <div style={{ marginTop: 8 }}><CopyRow t={t} tr={tr} m={m} accent={accent} /></div>
      </div>
    </div>
  );
}

// ── What members see: the public read, projected as the listing books it ─────────────────────
function MemberPreview({ t, tr, role, providerId, nonce }) {
  const locale = intlLocale();
  const [state, setState] = React.useState({ kind: 'loading' });
  React.useEffect(() => {
    if (!providerId || !window.ShapeCoachAvailability?.get) { setState({ kind: 'none' }); return undefined; }
    let on = true;
    setState({ kind: 'loading' });
    window.ShapeCoachAvailability.get(role, providerId, { fresh: true })
      .then((d) => {
        if (!on) return;
        if (!d || !Array.isArray(d.slots)) { setState({ kind: 'error' }); return; }
        if (d.slots.length && !bsIsZone(d.timezone)) { setState({ kind: 'nozone' }); return; }
        const len = Number(d.rules && d.rules.consultMin);
        const sessionMin = Number.isInteger(len) && len >= 5 && len <= 240 ? len : 15;
        const open = bsProjectAvailability({ slots: d.slots, booked: d.booked || [], weeks: 2, zone: d.timezone, busy: d.busy || [], rules: d.rules || null, sessionMin });
        setState({ kind: 'ready', open, atCapacity: d.atCapacity === true, intros: !!(d.rules && d.rules.introsAtCapacity) });
      })
      .catch(() => { if (on) setState({ kind: 'error' }); });
    return () => { on = false; };
  }, [role, providerId, nonce]);
  // On the coach's own clock (P9: the account's zone), as a member set to that zone sees them.
  const fmt = (at) => {
    try { return new Date(at).toLocaleString(locale, { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: viewerZone() }); } catch (e) { return new Date(at).toISOString(); }
  };
  let body;
  if (state.kind === 'loading') body = <Note t={t}>{tr('coach:hours.previewLoading', { defaultValue: 'Reading what members see…' })}</Note>;
  else if (state.kind === 'none') body = <Note t={t}>{tr('coach:hours.previewNone', { defaultValue: 'Members see your open times once your listing is set up.' })}</Note>;
  else if (state.kind === 'error') body = <Note t={t}>{tr('coach:hours.previewError', { defaultValue: "Couldn't read your open times just now. Your hours are saved as shown above." })}</Note>;
  else if (state.kind === 'nozone') body = <Note t={t} tone="err">{tr('coach:hours.previewNoZone', { defaultValue: 'Your hours have no time zone yet, so members see no times. Set your time zone in Settings to fix it.' })}</Note>;
  else {
    // Full with intro calls closed: members join the waiting list and the listing offers no
    // times (its introClosed), so neither does this read-back (Codex on #2483).
    const closed = state.atCapacity && !state.intros;
    const first = closed ? [] : state.open.slice(0, 6);
    body = (
      <div>
        {state.atCapacity ? <Note t={t} style={{ marginBottom: 8 }}>{state.intros
          ? tr('coach:hours.previewFullIntros', { defaultValue: "You're full, so new members join your waiting list. They can still book a free intro call." })
          : tr('coach:hours.previewFull', { defaultValue: "You're full, so new members join your waiting list instead of booking." })}</Note> : null}
        {closed ? null : first.length ? (
          <>
            <Note t={t}>{tr('coach:hours.previewCount', { defaultValue: '{count, plural, one {# open time} other {# open times}} in the next two weeks. The next ones:', count: state.open.length })}</Note>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {first.map((s) => (
                <span key={s.at} data-hours-preview="" style={{ padding: '7px 10px', borderRadius: 999, border: `1.5px dashed ${teal(t)}`, fontFamily: t.MONO, fontSize: 12, color: t.INK }}>{fmt(s.at)}</span>
              ))}
            </div>
          </>
        ) : <Note t={t}>{tr('coach:hours.previewEmpty', { defaultValue: 'No open times in the next two weeks. Add hours above, or check your time off and rules.' })}</Note>}
      </div>
    );
  }
  return <div data-hours-members="" style={{ ...bsMpGlass(t, t.INK, { radius: 16 }), marginTop: 10, padding: 14 }}>
    <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>{tr('coach:hours.previewHead', { defaultValue: 'What members can book' })}</div>
    {body}
  </div>;
}

// ── Booking rules: glass rows, each value in a pill that opens to its choices ─────────────────
const labelSt = (t) => ({ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, lineHeight: 1.25 });
const subSt = (t) => ({ display: 'block', fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK50, marginTop: 1, lineHeight: 1.35 });

function RulesEditor({ t, tr, role, disabled, onChanged, accent }) {
  const [state, setState] = React.useState({ kind: disabled ? 'preview' : 'loading' });
  const [rules, setRules] = React.useState({ bufferMin: 0, maxPerDay: null, minNoticeHours: 0, consultMin: 15, introsAtCapacity: false });
  const [msg, setMsg] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [openRule, setOpenRule] = React.useState(null); // the row open to its choices
  React.useEffect(() => {
    if (disabled) return undefined;
    let on = true;
    setState({ kind: 'loading' });
    window.ShapeCoachHours.rules(role)
      .then((d) => { if (!on) return; if (d.rules) setRules(d.rules); setState({ kind: d.providerId ? (d.ready === false ? 'notready' : 'ready') : 'none' }); })
      .catch(() => { if (on) setState({ kind: 'error' }); });
    return () => { on = false; };
  }, [role, disabled, reload]);
  const save = async (key, value) => {
    if (disabled || busy) return;
    const before = rules;
    setRules({ ...rules, [key]: value }); setBusy(key); setMsg(null);
    try {
      const r = await window.ShapeCoachHours.saveRules(role, { [key]: value });
      if (r && r.rules) setRules(r.rules);
      setMsg({ tone: 'ok', text: tr('coach:hours.ruleSaved', { defaultValue: 'Saved.' }) });
      onChanged && onChanged();
    } catch (e) {
      setRules(before);
      setMsg({ tone: 'err', text: (e && e.message) || tr('coach:hours.ruleFailed', { defaultValue: "Couldn't save that. Try again." }) });
    } finally { setBusy(null); }
  };
  if (state.kind === 'loading') return <Note t={t} style={{ marginTop: 4 }}>{tr('coach:hours.rulesLoading', { defaultValue: 'Reading your rules…' })}</Note>;
  if (state.kind === 'error') return <div style={{ marginTop: 4 }}><Note t={t}>{tr('coach:hours.rulesError', { defaultValue: "Couldn't read your booking rules just now." })}</Note><Chip t={t} onClick={() => setReload((n) => n + 1)}>{tr('coach:hours.retry', { defaultValue: 'Try again' })}</Chip></div>;
  if (state.kind === 'none') return <Note t={t} style={{ marginTop: 4 }}>{tr('coach:hours.rulesNone', { defaultValue: 'Booking rules open once your coach application is approved.' })}</Note>;
  if (state.kind === 'notready') return <Note t={t} style={{ marginTop: 4 }}>{tr('coach:hours.rulesNotReady', { defaultValue: "Booking rules aren't set up yet. They'll be ready after the next update." })}</Note>;
  const min = (n) => tr('coach:hours.minutes', { defaultValue: '{n} min', n });
  const hrs = (n) => tr('coach:hours.hours', { defaultValue: '{n, plural, one {# hour} other {# hours}}', n });
  const withCurrent = (opts, cur) => (opts.some(([v]) => v === cur) ? opts : [...opts, [cur, null]].sort((a, b) => (a[0] == null ? -1 : b[0] == null ? 1 : a[0] - b[0])));
  const rows = [
    ['consultMin', tr('coach:hours.ruleIntro', { defaultValue: 'Free intro call' }), tr('coach:hours.ruleIntroSub', { defaultValue: 'How long a first call with a new member runs.' }),
      withCurrent([[10], [15], [20], [30], [45], [60]], rules.consultMin).map(([v]) => [v, min(v)])],
    ['minNoticeHours', tr('coach:hours.ruleNotice', { defaultValue: 'Notice before a booking' }), tr('coach:hours.ruleNoticeSub', { defaultValue: 'How soon a member can book you.' }),
      withCurrent([[0], [2], [12], [24], [48]], rules.minNoticeHours).map(([v]) => [v, v === 0 ? tr('coach:hours.none', { defaultValue: 'None' }) : hrs(v)])],
    ['bufferMin', tr('coach:hours.ruleBuffer', { defaultValue: 'Break between sessions' }), tr('coach:hours.ruleBufferSub', { defaultValue: 'Kept free after every session.' }),
      withCurrent([[0], [10], [15], [30]], rules.bufferMin).map(([v]) => [v, v === 0 ? tr('coach:hours.none', { defaultValue: 'None' }) : min(v)])],
    ['maxPerDay', tr('coach:hours.ruleMax', { defaultValue: 'Most bookings a day' }), tr('coach:hours.ruleMaxSub', { defaultValue: 'Members see no more times once a day is full.' }),
      withCurrent([[null], [2], [4], [6], [8]], rules.maxPerDay).map(([v]) => [v, v == null ? tr('coach:hours.noLimit', { defaultValue: 'No limit' }) : String(v)])],
  ];
  const cant = disabled || !!busy;
  const pick = (key, v) => { if (rules[key] !== v) save(key, v); };
  const current = (key, opts) => { const o = opts.find(([v]) => rules[key] === v); return o ? o[1] : ''; };
  const fullLabel = tr('coach:hours.ruleFullIntros', { defaultValue: 'Intro calls while you are full' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(([key, label, sub, opts]) => {
        const isOpen = openRule === key;
        return (
          <div key={key} data-hours-rule={key} style={{ ...bsMpGlass(t, t.INK, { radius: 16 }), overflow: 'hidden' }}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpenRule(isOpen ? null : key)}
              style={{ width: '100%', minHeight: 58, padding: '9px 12px 9px 14px', display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'transparent', color: t.INK, textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ flex: 1, minWidth: 0 }}><span style={labelSt(t)}>{label}</span><span style={subSt(t)}>{sub}</span></span>
              <span data-hours-rule-value="" style={{ flex: 'none', padding: '6px 11px', borderRadius: 999, background: hxA(accent, 0.13), border: `1px solid ${hxA(accent, 0.42)}`, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: accent, whiteSpace: 'nowrap' }}>{current(key, opts)}</span>
            </button>
            {isOpen ? (
              <div role="group" aria-label={label} style={{ padding: '0 10px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {opts.map(([v, l]) => {
                  const on = rules[key] === v;
                  return (
                    <button key={String(v)} type="button" aria-pressed={on} disabled={cant} onClick={() => pick(key, v)}
                      style={{ flex: '1 0 auto', minHeight: 44, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? hxA(accent, 0.7) : hxA(t.INK, 0.14)}`, background: on ? hxA(accent, 0.18) : (t.isLight ? 'rgba(255,255,255,0.6)' : hxA(t.INK, 0.04)), color: on ? accent : t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: on ? 600 : 400, cursor: cant ? 'default' : 'pointer', opacity: cant && !on ? 0.6 : 1, whiteSpace: 'nowrap' }}>{l}</button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      <div data-hours-rule="introsAtCapacity" style={{ ...bsMpGlass(t, t.INK, { radius: 16 }), minHeight: 58, padding: '7px 8px 7px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}><span style={labelSt(t)}>{fullLabel}</span><span style={subSt(t)}>{tr('coach:hours.ruleFullIntrosSub', { defaultValue: 'Let members on your waiting list book a free call.' })}</span></span>
        <Switch t={t} on={!!rules.introsAtCapacity} label={fullLabel} onChange={(v) => save('introsAtCapacity', v)} />
      </div>
      {msg ? <Note t={t} tone={msg.tone} style={{ marginTop: 2 }}>{msg.text}</Note> : null}
    </div>
  );
}

// ── Time off: a glass card, its list, and the form under it ──────────────────────────────────
// Today's date in the coach's stored zone, which the route reads whole days and part-days in
// (Codex on #2483: a coach travelling across the date line saw the phone's today). en-CA formats
// as YYYY-MM-DD. With no stored zone yet, the phone's own date.
const isoToday = (zone) => {
  if (zone) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) {} }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function TimeOffEditor({ t, tr, role, disabled, onChanged, accent }) {
  const locale = intlLocale();
  const [state, setState] = React.useState({ kind: disabled ? 'preview' : 'loading' });
  const [list, setList] = React.useState([]);
  const [zone, setZone] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [mode, setMode] = React.useState('days');
  const [form, setForm] = React.useState(() => ({ from: isoToday(), to: isoToday(), date: isoToday(), start: 12 * 60, end: 17 * 60, note: '' }));
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => {
    if (disabled) return undefined;
    let on = true;
    setState({ kind: 'loading' });
    window.ShapeCoachHours.timeOff(role)
      .then((d) => { if (!on) return; setList(Array.isArray(d.timeOff) ? d.timeOff : []); setZone(d.timezone || null); setState({ kind: d.providerId ? (d.ready === false ? 'notready' : 'ready') : 'none' }); })
      .catch(() => { if (on) setState({ kind: 'error' }); });
    return () => { on = false; };
  }, [role, disabled, reload]);
  const tz = bsIsZone(zone) ? zone : undefined;
  const label = (b) => {
    const s = new Date(b.startsAt), e = new Date(b.endsAt);
    try {
      const day = (d) => d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
      const time = (d) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz });
      const midnight = (d) => time(d) === new Date(Date.UTC(2000, 0, 1)).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
      if (midnight(s) && midnight(e)) {
        const last = new Date(e.getTime() - 1);
        return day(s) === day(last) ? `${day(s)} · ${tr('coach:hours.allDay', { defaultValue: 'all day' })}` : `${day(s)} – ${day(last)}`;
      }
      return day(s) === day(e) ? `${day(s)} · ${time(s)} – ${time(e)}` : `${day(s)} ${time(s)} – ${day(e)} ${time(e)}`;
    } catch (err) { return `${b.startsAt} – ${b.endsAt}`; }
  };
  const upcoming = list.filter((b) => new Date(b.endsAt).getTime() > Date.now());
  const add = async () => {
    if (busy || disabled) return;
    setBusy(true); setMsg(null);
    try {
      let body;
      if (mode === 'days') body = { fromDate: form.from, toDate: form.to < form.from ? form.from : form.to };
      else {
        const [y, mo, d] = form.date.split('-').map(Number);
        const at = (m) => (tz ? bsInstantInZone(y, mo, d, Math.floor(m / 60), m % 60, tz) : new Date(y, mo - 1, d, Math.floor(m / 60), m % 60).getTime());
        const s = at(form.start), e = at(Math.min(form.end, 1439));
        if (!(Number.isFinite(s) && Number.isFinite(e) && e > s)) { setMsg({ tone: 'err', text: tr('coach:hours.offOrder', { defaultValue: 'The time off ends before it starts.' }) }); return; }
        body = { startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString() };
      }
      if (form.note.trim()) body.note = form.note.trim();
      const r = await window.ShapeCoachHours.addTimeOff(role, body);
      if (r && r.timeOff) setList((prev) => [...prev, r.timeOff].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
      setAdding(false);
      setForm((f) => ({ ...f, note: '' }));
      setMsg({ tone: 'ok', text: r && r.overlapping > 0
        ? tr('coach:hours.offAddedOverlap', { defaultValue: 'Added. You still have {count, plural, one {# session} other {# sessions}} in that time: move or cancel them in your calendar.', count: r.overlapping })
        : tr('coach:hours.offAdded', { defaultValue: 'Added. Members can’t book you in that time.' }) });
      onChanged && onChanged();
    } catch (e) {
      setMsg({ tone: 'err', text: (e && e.message) || tr('coach:hours.offFailed', { defaultValue: "Couldn't add that time off. Try again." }) });
    } finally { setBusy(false); }
  };
  const remove = async (b) => {
    if (busy || disabled) return;
    setBusy(true); setMsg(null);
    try {
      await window.ShapeCoachHours.removeTimeOff(role, b.id);
      setList((prev) => prev.filter((x) => x.id !== b.id));
      setMsg({ tone: 'ok', text: tr('coach:hours.offRemoved', { defaultValue: 'Removed. Those times are open again.' }) });
      onChanged && onChanged();
    } catch (e) {
      setMsg({ tone: 'err', text: (e && e.message) || tr('coach:hours.offRemoveFailed', { defaultValue: "Couldn't remove that. Try again." }) });
    } finally { setBusy(false); }
  };
  if (state.kind === 'loading') return <Note t={t} style={{ marginTop: 4 }}>{tr('coach:hours.offLoading', { defaultValue: 'Reading your time off…' })}</Note>;
  if (state.kind === 'error') return <div style={{ marginTop: 4 }}><Note t={t}>{tr('coach:hours.offError', { defaultValue: "Couldn't read your time off just now." })}</Note><Chip t={t} onClick={() => setReload((n) => n + 1)}>{tr('coach:hours.retry', { defaultValue: 'Try again' })}</Chip></div>;
  if (state.kind === 'none') return <Note t={t} style={{ marginTop: 4 }}>{tr('coach:hours.offNone', { defaultValue: 'Time off opens once your coach application is approved.' })}</Note>;
  if (state.kind === 'notready') return <Note t={t} style={{ marginTop: 4 }}>{tr('coach:hours.offNotReady', { defaultValue: "Time off isn't set up yet. It'll be ready after the next update." })}</Note>;
  const field = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 10px', borderRadius: 10, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, colorScheme: t.isLight ? 'light' : 'dark', fontFamily: t.MONO, fontSize: 15, outline: 'none' };
  const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 5 };
  const openForm = () => { const today = isoToday(tz); setForm((f) => ({ ...f, from: today, to: today, date: today })); setAdding(true); setMsg(null); };
  const hair = `1px solid ${hxA(t.INK, 0.1)}`;
  return (
    <div>
      <div data-hours-off-card="" style={{ ...bsMpGlass(t, t.INK, { radius: 16 }), padding: '4px 8px 4px 14px' }}>
        {upcoming.map((b) => (
          <div key={b.id} data-hours-off="" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 50, borderBottom: hair }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{label(b)}</div>
              {b.note ? <div style={{ fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK50, marginTop: 2 }}>{b.note}</div> : null}
            </div>
            <button type="button" disabled={busy} onClick={() => remove(b)} aria-label={tr('coach:hours.offRemoveAria', { defaultValue: 'Remove time off {when}', when: label(b) })}
              style={{ flex: 'none', width: 44, height: 44, marginRight: -8, border: 0, background: 'transparent', color: t.INK50, fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50 }}>
          {upcoming.length ? <span style={{ flex: 1 }} /> : <span data-hours-off-empty="" style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70 || t.INK50 }}>{tr('coach:hours.offEmpty', { defaultValue: 'No time off coming up.' })}</span>}
          {adding ? null : (
            <button type="button" data-hours-off-add="" disabled={disabled} onClick={openForm}
              style={{ flex: 'none', minHeight: 44, padding: 0, border: 0, background: 'transparent', display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer' }}>
              <span style={{ padding: '7px 13px', borderRadius: 999, border: `1px dashed ${hxA(accent, 0.7)}`, color: accent, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', opacity: disabled ? 0.75 : 1 }}>＋ {tr('coach:hours.offAddRow', { defaultValue: 'Add time off' })}</span>
            </button>
          )}
        </div>
      </div>
      {adding ? (
        <div data-hours-off-form="" style={{ ...bsMpGlass(t, t.INK, { radius: 18 }), marginTop: 10, padding: 14 }}>
          <div role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${t.RULE}`, borderRadius: 999, padding: 3, gap: 3 }}>
            {[['days', tr('coach:hours.offWholeDays', { defaultValue: 'Whole days' })], ['part', tr('coach:hours.offPartDay', { defaultValue: 'Part of a day' })]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                style={{ minHeight: 44, border: 0, borderRadius: 999, background: mode === k ? teal(t) : 'transparent', color: mode === k ? onTeal(t) : t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          {mode === 'days' ? (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label><span style={lbl}>{tr('coach:hours.offFrom', { defaultValue: 'From' })}</span><input type="date" style={field} value={form.from} min={isoToday(tz)} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} /></label>
              <label><span style={lbl}>{tr('coach:hours.offTo', { defaultValue: 'To' })}</span><input type="date" style={field} value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>{tr('coach:hours.offDate', { defaultValue: 'Day' })}</span><input type="date" style={field} value={form.date} min={isoToday(tz)} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label><span style={lbl}>{tr('coach:hours.offFrom', { defaultValue: 'From' })}</span><input type="time" step={BS_HOURS_STEP * 60} style={field} value={bsHoursToInput(form.start)} onChange={(e) => { const m = bsHoursFromInput(e.target.value); if (m != null) setForm({ ...form, start: m }); }} /></label>
              <label><span style={lbl}>{tr('coach:hours.offTo', { defaultValue: 'To' })}</span><input type="time" step={BS_HOURS_STEP * 60} style={field} value={bsHoursToInput(form.end)} onChange={(e) => { const m = bsHoursFromInput(e.target.value); if (m != null) setForm({ ...form, end: m }); }} /></label>
            </div>
          )}
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={lbl}>{tr('coach:hours.offNote', { defaultValue: 'Note · only you see it' })}</span>
            <input type="text" maxLength={500} style={{ ...field, fontFamily: t.DISPLAY }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={tr('coach:hours.offNotePh', { defaultValue: 'Vacation, a competition…' })} />
          </label>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setAdding(false)} style={{ flex: 1, minHeight: 44, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('coach:hours.cancel', { defaultValue: 'Cancel' })}</button>
            <button type="button" data-hours-off-save="" disabled={busy} onClick={add} style={{ flex: 1.4, minHeight: 44, borderRadius: 999, border: 0, background: teal(t), color: onTeal(t), fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? tr('coach:hours.saving', { defaultValue: 'Saving…' }) : tr('coach:hours.offAdd', { defaultValue: 'Add time off' })}</button>
          </div>
        </div>
      ) : null}
      {msg ? <Note t={t} tone={msg.tone} style={{ marginTop: 8 }}>{msg.text}</Note> : null}
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────
export function BSCoachHoursPage({ role = 'trainer', onBack, onOpenCalendar }) {
  const { useBS, BSPage, BSDetailHeader, BSFooter } = window;
  const t = useBS();
  const tr = useShapeTr();
  const live = signedInNow() && !!window.ShapeCoachHours;
  const accent = roleAccent(role);
  const [load, setLoad] = React.useState(live ? 'loading' : 'preview');
  const [seed, setSeed] = React.useState(() => (live ? bsHoursEmpty() : bsHoursFromRows(PREVIEW_ROWS)));
  const [days, setDays] = React.useState(() => bsHoursClone(seed));
  const [zone, setZone] = React.useState(null);
  const [providerId, setProviderId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [leaving, setLeaving] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [previewNonce, setPreviewNonce] = React.useState(0);
  React.useEffect(() => {
    if (!live) return undefined;
    let on = true;
    setLoad('loading');
    window.ShapeCoachHours.get(role)
      .then((d) => {
        if (!on) return;
        if (!d.providerId) { setLoad('none'); return; }
        const m = bsHoursFromRows(d.slots);
        setSeed(m); setDays(bsHoursClone(m)); setZone(d.timezone || null); setProviderId(d.providerId); setLoad('ready');
      })
      .catch(() => { if (on) setLoad('error'); });
    return () => { on = false; };
  }, [role, live, reload]);
  const dirty = !bsHoursSame(days, seed);
  const valid = bsHoursValid(days);
  const total = bsHoursTotal(days);
  // The zone a save stamps: the account's (P9; ShapeCoachHours.zone reads services/shapeZone.mjs),
  // this phone's only as an account's first default. Named the way Settings names it.
  const phoneZone = window.ShapeCoachHours?.zone?.() || null;
  const zoneName = (z) => zoneLabel(z) || z;
  const zoneLine = zone
    ? (phoneZone && phoneZone !== zone
      ? tr('coach:hours.zoneMoved', { defaultValue: 'Times in {zone}. Saving moves them to your time zone, {phone}.', zone: zoneName(zone), phone: zoneName(phoneZone) })
      : tr('coach:hours.zone', { defaultValue: 'Times in {zone}', zone: zoneName(zone) }))
    : (phoneZone ? tr('coach:hours.zoneFirst', { defaultValue: 'Times will be saved in {zone}', zone: zoneName(phoneZone) }) : '');
  const hoursLabel = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return m ? tr('coach:hours.totalHm', { defaultValue: '{h} h {m} min', h, m }) : tr('coach:hours.totalH', { defaultValue: '{h, plural, one {# hour} other {# hours}}', h });
  };
  // The stored hours are on another zone than the phone's (a coach who moved), or on none (hours
  // saved before zones were, which members can't book): either way they stay as they are until a
  // save, so placing them in the phone's zone is its own action, never a side effect of looking
  // (Codex on #2483: with nothing edited there was no way to save).
  const zoneMoved = live && load === 'ready' && !!phoneZone && phoneZone !== zone && bsHoursTotal(seed) > 0;
  const save = async ({ force = false } = {}) => {
    if (!live || saving || (!dirty && !force) || !valid) return false;
    setSaving(true); setMsg(null);
    try {
      const r = await window.ShapeCoachHours.save(role, bsHoursToRows(days));
      setSeed(bsHoursClone(days));
      if (r && r.timezone) setZone(r.timezone);
      setMsg({ tone: 'ok', text: tr('coach:hours.saved', { defaultValue: 'Saved. Members can book these times now.' }) });
      setPreviewNonce((n) => n + 1);
      return true;
    } catch (e) {
      // The route clears the old hours before it writes the new ones, so a failed save can leave
      // fewer hours stored, or none (Codex on #2483). Read back what is stored: the editor keeps
      // the coach's changes on screen with the save bar up, and says what members see now.
      let stored = null, storedZone = null;
      try { const d = await window.ShapeCoachHours.get(role); if (d && d.providerId) { stored = bsHoursFromRows(d.slots); storedZone = d.timezone || null; if (storedZone) setZone(storedZone); } } catch (e2) {}
      setPreviewNonce((n) => n + 1);
      // What was sent is what is stored (the save landed and only its answer was lost): it saved.
      // A zone-only save stores the same hours, so for one the zone has to have moved too.
      const sentChange = !bsHoursSame(days, seed);
      if (stored && bsHoursSame(stored, days) && (sentChange || (!!phoneZone && storedZone === phoneZone))) {
        setSeed(bsHoursClone(days));
        setMsg({ tone: 'ok', text: tr('coach:hours.saved', { defaultValue: 'Saved. Members can book these times now.' }) });
        return true;
      }
      let text;
      if (stored && bsHoursSame(stored, seed)) text = (e && e.message) || tr('coach:hours.saveFailed', { defaultValue: "Couldn't save your hours. Nothing changed; try again." });
      else if (stored) { setSeed(stored); text = tr('coach:hours.savePartial', { defaultValue: "Your hours didn't fully save, so members see only what is stored now. Save again to finish." }); }
      else text = tr('coach:hours.saveUnknown', { defaultValue: "Couldn't save your hours or check what is stored. Save again before you leave." });
      setMsg({ tone: 'err', text });
      return false;
    } finally { setSaving(false); }
  };
  // Leaving with unsaved hours (Back, or See your calendar) asks first; `leaving` holds where to.
  const leaveTo = (go) => { if (!go) return; if (dirty && live && load === 'ready') setLeaving(() => go); else go && go(); };
  const back = () => leaveTo(onBack);
  const perWeek = load === 'ready' || load === 'preview' ? tr('coach:hours.perWeek', { defaultValue: '{total} a week', total: hoursLabel(total) }) : null;

  let week;
  if (load === 'loading') week = <Note t={t} style={{ marginTop: 4 }}>{tr('coach:hours.loading', { defaultValue: 'Reading your hours…' })}</Note>;
  else if (load === 'error') week = <div style={{ marginTop: 4 }}><Note t={t}>{tr('coach:hours.error', { defaultValue: "Couldn't read your hours just now. Nothing is lost." })}</Note><div style={{ marginTop: 8 }}><Chip t={t} onClick={() => setReload((n) => n + 1)}>{tr('coach:hours.retry', { defaultValue: 'Try again' })}</Chip></div></div>;
  else if (load === 'none') week = <Note t={t} style={{ marginTop: 4 }}>{tr('coach:hours.notCoach', { defaultValue: 'Your hours open once your coach application is approved.' })}</Note>;
  // The preview's week works on screen (owner, 2026-10-31: "the toggles arent working"): its switches,
  // times and copy change the sample until you leave, as Make it yours does; there is nothing to save.
  else week = <WeekGrid t={t} tr={tr} days={days} setDays={(d) => { setDays(d); setMsg(null); }} disabled={false} accent={accent} perWeek={perWeek} />;

  return (
    <BSPage>
      {/* With unsaved hours there is no corner: it opens the profile and unmounts this page with
          no ask (Codex on #2483). Back and See your calendar ask first; noCorner takes the pinned
          strip's corner off too. */}
      <BSDetailHeader onBack={back} noCorner={dirty && live && load === 'ready'} kicker={tr('coach:hours.kicker', { defaultValue: 'Your practice' })} title={tr('coach:hours.title', { defaultValue: 'Your hours.' })} />
      <div data-coach-hours="" style={{ padding: `0 ${t.padX}px ${dirty ? 110 : 24}px` }}>
        <Note t={t}>{tr('coach:hours.blurb', { defaultValue: 'When members can book you. Your hours repeat every week; time off and your rules close times inside them.' })}</Note>
        {load === 'preview' ? <Note t={t} style={{ marginTop: 6, fontSize: 12.5, color: t.INK50 }}>{tr('coach:hours.preview', { defaultValue: 'A preview with sample hours. Sign in as a coach to set yours.' })} {tr('coach:hours.previewTry', { defaultValue: 'Try it: your changes show here until you leave.' })}</Note> : null}

        <div style={{ marginTop: 20 }}>
          <HoursHead t={t} accent={accent}>{tr('coach:hours.weekHead', { defaultValue: 'Every week' })}</HoursHead>
          {zoneLine && load === 'ready' ? <div style={{ margin: '0 0 8px', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.04em', color: t.INK50 }}>{zoneLine}</div> : null}
          {zoneMoved && !dirty ? <div style={{ marginBottom: 8 }}><Chip t={t} disabled={saving} onClick={() => save({ force: true })}>{zone
            ? tr('coach:hours.zoneMove', { defaultValue: 'Move my hours to {zone}', zone: zoneName(phoneZone) })
            : tr('coach:hours.zoneSet', { defaultValue: 'Save my hours in {zone}', zone: zoneName(phoneZone) })}</Chip></div> : null}
          {week}
          {load === 'ready' && !dirty && msg ? <Note t={t} tone={msg.tone} style={{ marginTop: 10 }}>{msg.text}</Note> : null}
          {load === 'ready' ? <MemberPreview t={t} tr={tr} role={role} providerId={providerId} nonce={previewNonce} /> : null}
        </div>

        <div style={{ marginTop: 24 }}>
          <HoursHead t={t} accent={accent}>{tr('coach:hours.rulesHead', { defaultValue: 'Booking rules' })}</HoursHead>
          <RulesEditor t={t} tr={tr} role={role} disabled={!live} onChanged={() => setPreviewNonce((n) => n + 1)} accent={accent} />
        </div>

        <div style={{ marginTop: 24 }}>
          <HoursHead t={t} accent={accent}>{tr('coach:hours.offHead', { defaultValue: 'Time off' })}</HoursHead>
          <TimeOffEditor t={t} tr={tr} role={role} disabled={!live} onChanged={() => setPreviewNonce((n) => n + 1)} accent={accent} />
        </div>

        {onOpenCalendar ? (
          <button type="button" data-hours-calendar="" onClick={() => leaveTo(onOpenCalendar)}
            style={{ ...bsMpGlass(t, t.INK, { radius: 16 }), marginTop: 20, width: '100%', minHeight: 52, padding: '0 14px', color: t.INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            {tr('coach:hours.openCalendar', { defaultValue: 'See your calendar' })}<span style={{ color: accent }}>→</span>
          </button>
        ) : null}
      </div>

      {dirty && load === 'ready' ? (
        <div data-hours-savebar="" style={{ position: 'sticky', bottom: 0, zIndex: 5, padding: `10px ${t.padX}px calc(12px + env(safe-area-inset-bottom))`, background: t.PAPER, borderTop: `1px solid ${t.RULE}` }}>
          {leaving ? <Note t={t} style={{ marginBottom: 8 }}>{tr('coach:hours.leaveAsk', { defaultValue: "You haven't saved these hours." })}</Note> : null}
          {msg && msg.tone === 'err' ? <Note t={t} tone="err" style={{ marginBottom: 8 }}>{msg.text}</Note> : null}
          {!valid ? <Note t={t} tone="err" style={{ marginBottom: 8 }}>{tr('coach:hours.fixFirst', { defaultValue: 'Fix the times marked in red to save.' })}</Note> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" data-hours-undo="" onClick={() => { if (leaving) { leaving(); return; } setDays(bsHoursClone(seed)); setMsg(null); }}
              style={{ flex: 1, minHeight: 46, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
              {leaving ? tr('coach:hours.discardLeave', { defaultValue: 'Leave without saving' }) : tr('coach:hours.undo', { defaultValue: 'Undo changes' })}
            </button>
            <button type="button" data-save-hours="" disabled={saving || !valid} onClick={async () => { const ok = await save(); if (ok && leaving) leaving(); }}
              style={{ flex: 1.3, minHeight: 46, borderRadius: 999, border: 0, background: teal(t), color: onTeal(t), fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: saving || !valid ? 'default' : 'pointer', opacity: saving || !valid ? 0.55 : 1 }}>
              {saving ? tr('coach:hours.saving', { defaultValue: 'Saving…' }) : tr('coach:hours.save', { defaultValue: 'Save hours' })}
            </button>
          </div>
        </div>
      ) : null}
      {BSFooter ? <BSFooter left={tr('coach:hours.footer', { defaultValue: 'Your hours' })} right={zone ? zoneName(zone) : ''} /> : null}
    </BSPage>
  );
}
