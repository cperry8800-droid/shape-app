import React from 'react';
// iosAppBroadsheetCalendar.jsx — Sheet overlay system + Week/Month calendar screen.
// Newspaper-styled. Role-aware events (client / trainer / nutritionist).

const { useState: useStateBSCal, useEffect: useEffectBSCal, useContext: useContextBSCal, createContext: createContextBSCal, useRef: useRefBSCal } = React;
const { useBS: useBSCal, BSPage: BSPageCal, BSPageHeader: BSPageHeaderCal, BSAvatar: BSAvatarCal, BSEyebrow: BSEyebrowCal, BSSection: BSSectionCal, BSTag: BSTagCal, BSFooter: BSFooterCal } = window;

// ═══════════════════════════════════════════════════════════
// SHEET OVERLAY — newspaper style, slides up
// ═══════════════════════════════════════════════════════════
const BSSheetCtx = createContextBSCal(null);

function BSSheetProvider({ children }) {
  const [stack, setStack] = useStateBSCal([]); // array of { id, render }
  const idRef = useRefBSCal(0);

  function open(render) {
    const id = ++idRef.current;
    setStack(s => [...s, { id, render }]);
    return id;
  }
  function close(id) {
    setStack(s => id == null ? s.slice(0, -1) : s.filter(x => x.id !== id));
  }
  function closeAll() { setStack([]); }

  return (
    <BSSheetCtx.Provider value={{ open, close, closeAll }}>
      {children}
      {stack.map((s, i) => (
        <BSSheetHost key={s.id} onDismiss={() => close(s.id)} z={1000 + i}>
          {typeof s.render === 'function' ? s.render({ close: () => close(s.id) }) : s.render}
        </BSSheetHost>
      ))}
    </BSSheetCtx.Provider>
  );
}
function useBSSheet() {
  const v = useContextBSCal(BSSheetCtx);
  if (!v) throw new Error('useBSSheet outside provider');
  return v;
}

function BSSheetHost({ children, onDismiss, z }) {
  const t = useBSCal();
  const [mounted, setMounted] = useStateBSCal(false);
  useEffectBSCal(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: z, pointerEvents: 'auto',
      background: 'rgba(0,0,0,0.35)', opacity: mounted ? 1 : 0, transition: 'opacity 200ms ease',
    }} onClick={onDismiss}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: 36,
        background: t.PAPER, color: t.INK,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'transform 240ms cubic-bezier(0.2,0.8,0.2,1)',
        overflow: 'auto', borderTop: `2px solid ${t.INK}`,
        boxShadow: '0 -20px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ position: 'sticky', top: 0, background: t.PAPER, zIndex: 2, borderBottom: `1px solid ${t.RULE}` }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 6px' }}>
            <div style={{ width: 36, height: 3, background: t.INK, opacity: 0.4 }} />
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={onDismiss} style={{ borderRadius: t.RADIUS_SM,
            position: 'absolute', top: 10, right: 14, zIndex: 3,
            background: 'transparent', border: 0, color: t.INK,
            fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
            fontWeight: 700, cursor: 'pointer', padding: 6,
          }}>Close ✕</button>
          {children}
        </div>
      </div>
    </div>
  );
}

// Toast (small ephemeral)
function BSToast({ message, kind = 'info', onDone }) {
  const t = useBSCal();
  useEffectBSCal(() => { const id = setTimeout(onDone, 1800); return () => clearTimeout(id); }, []);
  return (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 100, zIndex: 2000,
      background: t.INK, color: t.PAPER, padding: '12px 14px',
      fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 14px 30px rgba(0,0,0,0.35)', borderLeft: `4px solid ${kind === 'ok' ? t.GREEN : kind === 'warn' ? t.AMBER : t.ACCENT}`,
    }}>
      <span style={{ flex: 1 }}>{message}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EVENT MODELS — per role
// ═══════════════════════════════════════════════════════════
// Each event: { day: 0-31 (May), time, dur, kind, title, sub, accent }
// May 2026: starts on Friday. Today = 14 (Thu, week 20).

function clientEvents(t) {
  return [
    // current week (May 11-17) — heavy detail
    { day: 20, time: '07:00', dur: 60, kind: 'TRN',  title: 'Upper Push — Peak',     sub: 'Jordan · 52m',     accent: t.AMBER, state: 'done' },
    { day: 20, time: '12:30', dur: 30, kind: 'MEAL', title: 'Lunch · chicken bowl',   sub: '620 kcal',          accent: t.BLUE, state: 'done' },
    { day: 21, time: '07:30', dur: 60, kind: 'TRN',  title: 'Upper Pull — Peak',     sub: 'Jordan · 52m',     accent: t.AMBER, state: 'now' },
    { day: 21, time: '15:00', dur: 30, kind: 'CON',  title: 'Nutrition consult',      sub: 'Dr. Maya · Zoom',  accent: t.RUST, state: 'next' },
    { day: 22, time: '06:30', dur: 45, kind: 'TRN',  title: 'Conditioning · Z2',      sub: '45m bike',          accent: t.AMBER },
    { day: 22, time: '19:30', dur: 30, kind: 'CHK',  title: 'Evening check-in',       sub: 'Sleep + RPE',       accent: t.GREEN },
    { day: 23, time: '07:00', dur: 60, kind: 'TRN',  title: 'Lower Push — Peak',     sub: 'Jordan · 56m',     accent: t.AMBER },
    { day: 24, time: '08:00', dur: 30, kind: 'CHK',  title: 'Weekly check-in',        sub: 'Photos + measure',  accent: t.GREEN },
    { day: 24, time: '11:00', dur: 30, kind: 'CON',  title: 'Coach 1:1',              sub: 'Jordan · video',    accent: t.RUST },
    { day: 25, time: '09:00', dur: 90, kind: 'TRN',  title: 'Lower Pull — Vol.',     sub: 'Jordan · 62m',     accent: t.AMBER },
    { day: 26, time: '—',     dur: 0,  kind: 'REST', title: 'Rest day',                sub: 'Walk + mobility',   accent: t.INK50 },
    // earlier in month — for month view density
    { day: 13, time: '07:30', dur: 60, kind: 'TRN',  title: 'Upper Pull — Vol.',     sub: 'Jordan',            accent: t.AMBER, state: 'done' },
    { day: 14, time: '07:00', dur: 60, kind: 'TRN',  title: 'Lower Push',             sub: 'Jordan',            accent: t.AMBER, state: 'done' },
    { day: 15, time: '15:00', dur: 30, kind: 'CON',  title: 'Nutrition consult',      sub: 'Dr. Maya',          accent: t.RUST, state: 'done' },
    { day: 16, time: '07:30', dur: 60, kind: 'TRN',  title: 'Upper Pull',             sub: 'Jordan',            accent: t.AMBER, state: 'done' },
    { day: 17, time: '08:00', dur: 60, kind: 'TRN',  title: 'Lower Pull',             sub: 'Jordan',            accent: t.AMBER, state: 'done' },
    { day: 18, time: '07:00', dur: 60, kind: 'TRN',  title: 'Z2 cardio',              sub: '60m',                accent: t.AMBER, state: 'done' },
    { day: 28, time: '15:00', dur: 30, kind: 'CON',  title: 'Nutrition follow-up',    sub: 'Dr. Maya',          accent: t.RUST },
    { day: 29, time: '07:00', dur: 60, kind: 'TRN',  title: 'Upper Push — Deload',   sub: 'Jordan',            accent: t.AMBER },
  ];
}

function trainerEvents(t) {
  return [
    { day: 20, time: '08:00', dur: 60, kind: 'SES', title: 'Alex Rivera',     sub: 'Upper Push',  accent: t.AMBER, state: 'done' },
    { day: 20, time: '10:00', dur: 60, kind: 'SES', title: 'Priya Shah',      sub: 'Lower Pull',  accent: t.AMBER, state: 'done' },
    { day: 21, time: '07:30', dur: 60, kind: 'SES', title: 'Alex Rivera',     sub: 'Upper Pull · in 14m', accent: t.AMBER, state: 'next' },
    { day: 21, time: '09:00', dur: 60, kind: 'SES', title: 'Marcus Lee',      sub: 'Conditioning',accent: t.AMBER },
    { day: 21, time: '11:00', dur: 30, kind: 'CHK', title: 'Sara Kim',         sub: 'Form review', accent: t.GREEN },
    { day: 21, time: '14:00', dur: 60, kind: 'SES', title: 'Devon Park',      sub: 'Lower Push',  accent: t.AMBER },
    { day: 21, time: '16:30', dur: 30, kind: 'ADM', title: 'Program review',   sub: '3 plans',     accent: t.RUST },
    { day: 22, time: '07:30', dur: 60, kind: 'SES', title: 'Alex Rivera',     sub: 'Z2 cardio',   accent: t.AMBER },
    { day: 22, time: '12:00', dur: 30, kind: 'CHK', title: 'Priya Shah',       sub: 'Check-in',    accent: t.GREEN },
    { day: 22, time: '15:00', dur: 60, kind: 'SES', title: 'Jules Romero',    sub: 'New intake',  accent: t.RUST },
    { day: 23, time: '08:00', dur: 60, kind: 'SES', title: 'Marcus Lee',      sub: 'Upper Push',  accent: t.AMBER },
    { day: 23, time: '10:00', dur: 60, kind: 'SES', title: 'Sara Kim',         sub: 'Lower Pull',  accent: t.AMBER },
    { day: 24, time: '08:00', dur: 60, kind: 'SES', title: 'Alex Rivera',     sub: 'Lower Push',  accent: t.AMBER },
    { day: 24, time: '11:00', dur: 60, kind: 'SES', title: 'Devon Park',      sub: 'Upper Pull',  accent: t.AMBER },
    { day: 24, time: '14:00', dur: 30, kind: 'ADM', title: 'New plan · Jules', sub: 'Build phase', accent: t.RUST },
    { day: 25, time: '09:00', dur: 60, kind: 'SES', title: 'Priya Shah',      sub: 'Lower Pull',  accent: t.AMBER },
    { day: 25, time: '11:00', dur: 60, kind: 'SES', title: 'Marcus Lee',      sub: 'Z2',          accent: t.AMBER },
    { day: 26, time: '—',     dur: 0,  kind: 'REST', title: 'Off',              sub: '',           accent: t.INK50 },
    { day: 13, time: '08:00', dur: 60, kind: 'SES', title: 'Alex Rivera',     sub: 'Upper Pull',  accent: t.AMBER, state: 'done' },
    { day: 14, time: '08:00', dur: 60, kind: 'SES', title: 'Priya Shah',      sub: 'Lower Push',  accent: t.AMBER, state: 'done' },
    { day: 15, time: '08:00', dur: 60, kind: 'SES', title: 'Marcus Lee',      sub: 'Cond.',       accent: t.AMBER, state: 'done' },
    { day: 16, time: '08:00', dur: 60, kind: 'SES', title: 'Sara Kim',         sub: 'Upper Push',  accent: t.AMBER, state: 'done' },
    { day: 17, time: '08:00', dur: 60, kind: 'SES', title: 'Devon Park',      sub: 'Lower Pull',  accent: t.AMBER, state: 'done' },
    { day: 28, time: '08:00', dur: 60, kind: 'SES', title: 'Alex Rivera',     sub: 'Deload',       accent: t.AMBER },
    { day: 29, time: '11:00', dur: 60, kind: 'SES', title: 'Jules Romero',    sub: 'Sess. 2',     accent: t.AMBER },
  ];
}

function nutriEvents(t) {
  return [
    { day: 21, time: '09:00', dur: 30, kind: 'CON', title: 'Alex Rivera',     sub: 'Cut · review', accent: t.RUST, state: 'now' },
    { day: 21, time: '11:00', dur: 60, kind: 'CON', title: 'Priya Shah',      sub: 'New intake',  accent: t.RUST, state: 'next' },
    { day: 21, time: '15:00', dur: 30, kind: 'CON', title: 'Marcus Lee',      sub: 'Follow-up',   accent: t.RUST },
    { day: 22, time: '10:00', dur: 30, kind: 'CON', title: 'Sara Kim',         sub: 'Check-in',    accent: t.RUST },
    { day: 22, time: '14:00', dur: 30, kind: 'ADM', title: 'Plan revisions',   sub: '3 plans',     accent: t.AMBER },
    { day: 23, time: '09:00', dur: 30, kind: 'CON', title: 'Devon Park',      sub: 'Bulk · review', accent: t.RUST },
    { day: 23, time: '11:00', dur: 60, kind: 'CON', title: 'Jules Romero',    sub: 'New intake',  accent: t.RUST },
    { day: 24, time: '10:00', dur: 30, kind: 'CON', title: 'Alex Rivera',     sub: 'Macro update',accent: t.RUST },
    { day: 25, time: '11:00', dur: 30, kind: 'CON', title: 'Priya Shah',      sub: 'Follow-up',   accent: t.RUST },
    { day: 20, time: '10:00', dur: 30, kind: 'CON', title: 'Devon Park',      sub: 'Check-in',    accent: t.RUST, state: 'done' },
    { day: 14, time: '09:00', dur: 30, kind: 'CON', title: 'Alex Rivera',     sub: 'Intake',       accent: t.RUST, state: 'done' },
    { day: 16, time: '09:00', dur: 30, kind: 'CON', title: 'Priya Shah',      sub: 'Intake',       accent: t.RUST, state: 'done' },
    { day: 28, time: '15:00', dur: 30, kind: 'CON', title: 'Marcus Lee',      sub: 'Phase 2',     accent: t.RUST },
  ];
}

function eventsFor(role, t) {
  if (role === 'trainer') return trainerEvents(t);
  if (role === 'nutritionist') return nutriEvents(t);
  return clientEvents(t);
}

// ═══════════════════════════════════════════════════════════
// CALENDAR SCREEN — week + month
// ═══════════════════════════════════════════════════════════
function BSCalendarScreen({ role = 'client', onProfile, initialMode = 'week', onBack }) {
  const t = useBSCal();
  // month picker state — default to May 2026 (the demo month with data)
  const [viewYear, setViewYear] = useStateBSCal(2026);
  const [viewMonth, setViewMonth] = useStateBSCal(4); // 0=Jan ... 4=May
  const [selDay, setSelDay] = useStateBSCal(14); // May 14
  const sourceDayByDate = { 20: 11, 21: 14, 22: 15, 23: 16, 24: 17, 25: 18, 26: 19 };
  const events = eventsFor(role, t).map((event) => {
    const day = sourceDayByDate[event.day];
    return day ? { ...event, day } : event;
  });
  const sheet = useBSSheet();
  const isDemoMonth = viewYear === 2026 && viewMonth === 4;
  const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][viewMonth];

  const masthead = role === 'trainer' ? <>The<br/>schedule.</>
                : role === 'nutritionist' ? <>The<br/>diary.</>
                : <>The<br/>calendar.</>;

  const trailing = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {onBack && (
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          padding: '6px 12px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
        }}>← Back</button>
      )}
      <BSAvatarCal init={role === 'trainer' ? 'J' : role === 'nutritionist' ? 'M' : 'A'} size={32} fill={role === 'trainer' ? t.AMBER : role === 'nutritionist' ? t.RUST : null} ink={role !== 'client' ? t.PAPER : null} onClick={onProfile} />
    </div>
  );

  return (
    <BSPageCal>
      <BSPageHeaderCal
        kicker="Section · Calendar"
        title={masthead}
        trailing={trailing}
      />

      {/* Month picker (prev / current / next) */}
      <div style={{ padding: `10px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, display: 'grid', gridTemplateColumns: '40px 1fr 40px', alignItems: 'center', gap: 0 }}>
        <button onClick={() => {
          let m = viewMonth - 1, y = viewYear;
          if (m < 0) { m = 11; y -= 1; }
          setViewMonth(m); setViewYear(y);
        }} style={{
          height: 36, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 14, fontWeight: 700,
        }}>‹</button>
        <div style={{ textAlign: 'center', borderTop: `1px solid ${t.INK}`, borderBottom: `1px solid ${t.INK}`, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 17, letterSpacing: '-0.02em', color: t.INK }}>{monthName}</span>
          <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, letterSpacing: '0.18em', fontWeight: 700 }}>{viewYear}</span>
        </div>
        <button onClick={() => {
          let m = viewMonth + 1, y = viewYear;
          if (m > 11) { m = 0; y += 1; }
          setViewMonth(m); setViewYear(y);
        }} style={{
          height: 36, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 14, fontWeight: 700,
        }}>›</button>
      </div>

      <BSCalendarMonth
        events={isDemoMonth ? events : []}
        viewYear={viewYear}
        viewMonth={viewMonth}
        monthName={monthName}
        isDemoMonth={isDemoMonth}
        selDay={selDay}
        setSelDay={setSelDay}
        sheet={sheet}
        role={role}
      />

      <BSFooterCal left="The Shape Daily · Calendar" right={`${monthName} · ${viewYear}`} />
    </BSPageCal>
  );
}

// ────────── WEEK VIEW
function BSCalendarWeek({ events, selDay, setSelDay, sheet, role }) {
  const t = useBSCal();
  const weekDays = [11, 12, 13, 14, 15, 16, 17]; // May 11-17 (Mon-Sun)
  const dowLabels = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

  // counts per day
  const countByDay = {};
  weekDays.forEach(d => { countByDay[d] = events.filter(e => e.day === d).length; });

  const dayEvents = events.filter(e => e.day === selDay).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <>
      {/* Week strip */}
      <div style={{ padding: `14px ${t.padX}px`, borderBottom: `2px solid ${t.INK}`, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {weekDays.map((d, i) => {
          const on = d === selDay;
          const isToday = d === 14;
          const c = countByDay[d];
          return (
            <button key={d} onClick={() => setSelDay(d)} style={{ borderRadius: t.RADIUS_SM,
              border: `1px solid ${on ? t.INK : t.HAIR}`,
              background: on ? t.INK : (isToday ? t.PAPER2 : 'transparent'),
              color: on ? t.PAPER : t.INK,
              padding: '8px 0 6px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}>
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', fontWeight: 600, opacity: 0.7 }}>{dowLabels[i]}</span>
              <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d}</span>
              <span style={{ display: 'flex', gap: 2, height: 4, marginTop: 2 }}>
                {[...Array(Math.min(c, 4))].map((_, k) => (
                  <span key={k} style={{ width: 3, height: 3, background: on ? t.PAPER : (isToday ? t.ACCENT : t.INK), borderRadius: 0 }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* Day timeline */}
      <BSSectionCal title={`Day · May ${selDay}`} meta={`${dayEvents.length} item${dayEvents.length === 1 ? '' : 's'}`} />
      <BSDayTimeline events={dayEvents} sheet={sheet} role={role} />
    </>
  );
}

// Day timeline — vertical, each event a row. Mark "now" (8:30 AM May 14) and gaps.
function BSDayTimeline({ events, sheet, role }) {
  const t = useBSCal();
  if (events.length === 0) {
    return (
      <div style={{ padding: `40px ${t.padX}px`, textAlign: 'center' }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 32, letterSpacing: '-0.03em', color: t.INK }}>Nothing on the diary.</div>
        <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, marginTop: 8, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Edition · empty</div>
      </div>
    );
  }
  return (
    <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
      {events.map((e, i) => {
        const done = e.state === 'done';
        const now  = e.state === 'now';
        const next = e.state === 'next';
        return (
          <div key={i} onClick={() => sheet.open(({ close }) => <BSEventSheet event={e} role={role} onClose={close} />)} style={{
            display: 'grid', gridTemplateColumns: '60px 1fr auto',
            gap: 12, alignItems: 'flex-start',
            padding: `${t.rowY + 4}px 0`,
            borderBottom: i === events.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            cursor: 'pointer',
          }}>
            <div style={{ fontFamily: t.MONO, fontSize: 11, color: now ? t.ACCENT : (done ? t.INK50 : t.INK), letterSpacing: '0.06em', fontWeight: now ? 700 : 600, fontVariantNumeric: 'tabular-nums' }}>
              {e.time}
              {e.dur > 0 && <div style={{ fontSize: 8.5, color: t.INK50, marginTop: 2, letterSpacing: '0.16em' }}>{e.dur}m</div>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <BSTagCal color={e.accent}>{e.kind}</BSTagCal>
                {now  && <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.ACCENT, letterSpacing: '0.22em', fontWeight: 700, textTransform: 'uppercase' }}>● Now</span>}
                {next && <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK70, letterSpacing: '0.22em', fontWeight: 700, textTransform: 'uppercase' }}>Up next</span>}
                {done && <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.22em', fontWeight: 700, textTransform: 'uppercase' }}>✓ Done</span>}
              </div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 16, color: done ? t.INK50 : t.INK, letterSpacing: '-0.015em', textDecoration: done ? 'line-through' : 'none' }}>{e.title}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 2, letterSpacing: '0.06em' }}>{e.sub}</div>
            </div>
            <div style={{ alignSelf: 'center', fontFamily: t.MONO, fontSize: 14, color: t.INK50 }}>›</div>
          </div>
        );
      })}
    </div>
  );
}

// ────────── MONTH VIEW
function BSCalendarMonth({ events, viewYear, viewMonth, monthName, isDemoMonth, selDay, setSelDay, sheet, role }) {
  const t = useBSCal();
  // Compute first-of-month DOW (Mon=0..Sun=6) and days-in-month for any year/month
  const firstJsDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun..6=Sat
  const firstDow = (firstJsDow + 6) % 7; // shift to Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;
  const todayDay = isCurrentMonth ? today.getDate() : null;
  // for the demo month (May 2026), pin "today" visual to the 14th
  const visualToday = isDemoMonth ? 14 : todayDay;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const eventsByDay = {};
  events.forEach(e => { (eventsByDay[e.day] = eventsByDay[e.day] || []).push(e); });

  const monthTotal = events.length;
  const doneCount = events.filter(e => e.state === 'done').length;

  return (
    <>
      {/* Month headline */}
      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 44, letterSpacing: '-0.04em', lineHeight: 0.9, color: t.INK }}>{monthName}</div>
          <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, marginTop: 6, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{viewYear} · Q{Math.floor(viewMonth/3)+1}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 34, letterSpacing: '-0.04em', lineHeight: 1, color: t.INK }}>{monthTotal}</div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 2 }}>{isDemoMonth ? `${doneCount} done · ${monthTotal - doneCount} ahead` : 'no items'}</div>
        </div>
      </div>

      {/* DOW header */}
      <div style={{ padding: `8px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, borderBottom: `1px solid ${t.RULE}` }}>
        {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => (
          <div key={d} style={{ padding: '4px 0 6px', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', color: t.INK50, fontWeight: 600, textAlign: 'center' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ padding: `0 ${t.padX}px ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {weeks.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: ri === weeks.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
            {row.map((d, ci) => {
              if (d == null) return <div key={ci} style={{ borderRight: ci < 6 ? `1px solid ${t.HAIR}` : 0, minHeight: 64, background: t.PAPER2, opacity: 0.4 }} />;
              const isToday = d === visualToday;
              const isSel = d === selDay;
              const dayEv = eventsByDay[d] || [];
              const dotsAccents = dayEv.slice(0, 3).map(e => e.accent);
              return (
                <button key={ci} onClick={() => setSelDay(d)} style={{ borderRadius: t.RADIUS_SM,
                  border: 'none',
                  borderRight: ci < 6 ? `1px solid ${t.HAIR}` : 'none',
                  background: isSel ? t.INK : (isToday ? t.PAPER2 : 'transparent'),
                  color: isSel ? t.PAPER : t.INK,
                  minHeight: 64, padding: '6px 6px 4px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4,
                  fontFamily: t.DISPLAY,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: t.W.display, fontSize: 16, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', color: isSel ? t.PAPER : (isToday ? t.ACCENT : t.INK) }}>{d}</span>
                    {dayEv.length > 0 && <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, color: isSel ? t.PAPER : t.INK50, letterSpacing: '0.1em' }}>{dayEv.length}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {dotsAccents.map((c, k) => (
                      <span key={k} style={{ width: 6, height: 6, background: isSel ? t.PAPER : c, display: 'inline-block' }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Day reader (inline — replaces the old week-strip drilldown) */}
      {(() => {
        const dayEv = (eventsByDay[selDay] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
        const dowFull = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
        const selDow = dowFull[(new Date(viewYear, viewMonth, selDay).getDay() + 6) % 7];
        return (
          <>
            <div style={{ padding: `16px ${t.padX}px 10px`, borderTop: `2px solid ${t.INK}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 700 }}>
                ▍ Day · {selDow} {monthName.slice(0,3)} {selDay}
              </div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
                {dayEv.length} {dayEv.length === 1 ? 'item' : 'items'}
              </div>
            </div>
            {dayEv.length === 0 ? (
              <div style={{ padding: `8px ${t.padX}px 18px`, borderTop: `1px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 10, color: t.INK50, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600 }}>
                — Nothing logged —
              </div>
            ) : (
              <div style={{ borderTop: `1px solid ${t.RULE}` }}>
                {dayEv.map((e, i) => (
                  <button key={i} onClick={() => sheet && sheet.open(<BSEventSheet event={e} role={role} onClose={() => sheet.close()} />)} style={{
                    width: '100%', padding: `12px ${t.padX}px`, borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}`, borderBottom: 0, borderLeft: 0, borderRight: 0,
                    background: 'transparent', textAlign: 'left', cursor: 'pointer',
                    display: 'grid', gridTemplateColumns: '52px 1fr auto', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK, letterSpacing: '0.05em' }}>
                      {e.time}
                      <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, fontWeight: 600, letterSpacing: '0.1em', marginTop: 2 }}>{e.dur ? `${e.dur}m` : ''}</div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ background: e.accent, color: e.kind === 'REST' ? t.PAPER : (e.accent === t.AMBER ? t.INK : t.PAPER), padding: '2px 6px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.15em' }}>{e.kind}</span>
                        {e.state === 'done' && <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.18em', fontWeight: 700 }}>· DONE</span>}
                      </div>
                      <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 17, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.15 }}>{e.title}</div>
                      <div style={{ fontFamily: t.DISPLAY, fontSize: 12, color: t.INK50, marginTop: 2 }}>{e.sub}</div>
                    </div>
                    <span style={{ fontFamily: t.MONO, fontSize: 14, color: t.INK50 }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </>
        );
      })()}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// EVENT DETAIL SHEET
// ═══════════════════════════════════════════════════════════
function BSEventSheet({ event, role, onClose }) {
  const t = useBSCal();
  const isWorkout = event.kind === 'TRN' || event.kind === 'SES';
  const isMeal    = event.kind === 'MEAL';
  const isConsult = event.kind === 'CON';
  const isCheck   = event.kind === 'CHK';

  return (
    <div>
      {/* Masthead-ish */}
      <div style={{ padding: `40px ${t.padX}px 18px`, borderBottom: `2px solid ${t.INK}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <BSTagCal color={event.accent}>{event.kind}</BSTagCal>
          <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', color: t.INK70, fontWeight: 600 }}>May {event.day} · {event.time}{event.dur ? ` · ${event.dur}m` : ''}</span>
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 40, lineHeight: 0.95, letterSpacing: '-0.035em', color: t.INK }}>
          {event.title}
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, color: t.INK70, marginTop: 8, letterSpacing: '-0.005em' }}>{event.sub}</div>
      </div>

      {/* Body */}
      {isWorkout && <BSEventWorkoutBody event={event} role={role} />}
      {isMeal    && <BSEventMealBody event={event} />}
      {isConsult && <BSEventConsultBody event={event} role={role} />}
      {isCheck   && <BSEventCheckBody event={event} />}
      {!isWorkout && !isMeal && !isConsult && !isCheck && <BSEventGenericBody event={event} />}

      {/* Actions */}
      <div style={{ position: 'sticky', bottom: 0, padding: 14, background: t.PAPER, borderTop: `2px solid ${t.INK}`, display: 'flex', gap: 8 }}>
        {(isWorkout || isMeal) && (
          <button onClick={() => { onClose(); window.__bsToast?.('Logged ✓', 'ok'); }} style={primaryBtn(t)}>{role === 'trainer' ? 'Mark complete' : (isMeal ? 'Log meal' : 'Start session →')}</button>
        )}
        {isConsult && <button onClick={() => { onClose(); window.__bsToast?.('Joining call…'); }} style={primaryBtn(t)}>Join consult →</button>}
        {isCheck   && <button onClick={() => { onClose(); window.__bsToast?.('Submitted check-in', 'ok'); }} style={primaryBtn(t)}>Submit check-in</button>}
        {!isWorkout && !isMeal && !isConsult && !isCheck && <button onClick={onClose} style={primaryBtn(t)}>Done</button>}
        <button onClick={() => { onClose(); window.__bsToast?.('Rescheduled to tomorrow', 'warn'); }} style={secondaryBtn(t)}>Reschedule</button>
      </div>
    </div>
  );
}

function primaryBtn(t) {
  return { flex: 1, padding: 16, background: t.INK, color: t.PAPER, border: 0, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' };
}
function secondaryBtn(t) {
  return { padding: '16px 18px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' };
}

function BSEventWorkoutBody({ event, role }) {
  const t = useBSCal();
  const moves = [
    { n: '01', m: 'Pull-up',        s: '4 × 6–8 · 3:00', l: '+42 LB' },
    { n: '02', m: 'Barbell row',    s: '4 × 8 · 2:00',    l: '155 LB' },
    { n: '03', m: 'Chest-sup. row', s: '3 × 10 · 1:30',   l: '60 LB'  },
    { n: '04', m: 'Face pull',      s: '3 × 15 · 1:00',   l: '35 LB'  },
    { n: '05', m: 'Incline curl',   s: '3 × 12 · 1:00',   l: '27.5 LB'},
    { n: '06', m: 'Farmer carry',   s: '3 × 40 m · 1:00', l: '80 LB'  },
  ];
  return (
    <>
      <div style={{ padding: `18px ${t.padX}px 14px`, borderBottom: `1px solid ${t.RULE}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[['DUR', `${event.dur}m`], ['MOVES', '6'], ['RPE', '8'], ['VOL', '1900LB']].map(([l, v], i) => (
          <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 20, color: t.INK, marginTop: 4, letterSpacing: '-0.03em' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: `12px ${t.padX}px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>▍ The card</div>
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {moves.map((r, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr 70px', alignItems: 'center', padding: `${t.rowY}px 0`,
            borderBottom: i === moves.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, fontWeight: 600 }}>{r.n}</span>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em' }}>{r.m}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 2, letterSpacing: '0.06em' }}>{r.s}</div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 12, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em' }}>{r.l}</div>
          </div>
        ))}
      </div>
      <div style={{ margin: `18px ${t.padX}px 18px`, padding: 18, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 8, fontWeight: 700 }}>▍ Coach note</div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 16, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {role === 'trainer'
            ? '"Watch the eccentric on row 2 — last week she cheated tempo at rep 6."'
            : '"Dead hang every pull-up. Chest to bar or it doesn\'t count."'}
        </div>
      </div>
      {/* Padding for sticky footer */}
      <div style={{ height: 90 }} />
    </>
  );
}

function BSEventMealBody({ event }) {
  const t = useBSCal();
  return (
    <>
      <div style={{ padding: `18px ${t.padX}px 16px`, borderBottom: `1px solid ${t.RULE}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[['KCAL', '620'], ['PRO', '48g'], ['CARB', '72g'], ['FAT', '14g']].map(([l, v], i) => (
          <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 20, color: t.INK, marginTop: 4, letterSpacing: '-0.03em' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: `12px ${t.padX}px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>▍ Ingredients</div>
      <div style={{ padding: `0 ${t.padX}px 16px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          ['Chicken breast', '180 g'],
          ['Jasmine rice',   '120 g cooked'],
          ['Tahini',         '1 tbsp'],
          ['Mixed greens',   '1 cup'],
          ['Lemon, salt',    'to taste'],
        ].map(([k, v], i, a) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: `${t.rowY}px 0`, borderBottom: i === a.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, letterSpacing: '-0.01em' }}>{k}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK70, letterSpacing: '0.1em' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 90 }} />
    </>
  );
}

function BSEventConsultBody({ event, role }) {
  const t = useBSCal();
  return (
    <>
      <div style={{ padding: `18px ${t.padX}px 16px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>Agenda</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, lineHeight: 1.6, letterSpacing: '-0.005em' }}>
          <li>Macro update for cut phase</li>
          <li>Sleep review · last 7 nights</li>
          <li>Restaurant strategy for weekend</li>
        </ul>
      </div>
      <div style={{ padding: `18px ${t.padX}px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>▍ Notes from last consult</div>
      <div style={{ padding: `0 ${t.padX}px 18px` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.5, letterSpacing: '-0.005em' }}>
          Cut went well into week 5. Energy held. Add 200 kcal to refeed Saturdays — avoid mid-cut plateau.
        </div>
      </div>
      <div style={{ height: 90 }} />
    </>
  );
}

function BSEventCheckBody({ event }) {
  const t = useBSCal();
  return (
    <>
      <div style={{ padding: `18px ${t.padX}px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>▍ Quick form</div>
      <div style={{ padding: `0 ${t.padX}px 18px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {['Sleep (hrs)','Energy (1–10)','Soreness (1–10)','RPE this week (1–10)'].map((q, i) => (
          <div key={i}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70, marginBottom: 6 }}>{q}</div>
            <input placeholder="—" style={{ borderRadius: t.RADIUS_SM, width: '100%', background: 'transparent', border: 0, borderBottom: `1px solid ${t.INK}`, padding: '10px 0', fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, outline: 'none' }} />
          </div>
        ))}
      </div>
      <div style={{ height: 90 }} />
    </>
  );
}

function BSEventGenericBody({ event }) {
  const t = useBSCal();
  return (
    <>
      <div style={{ padding: `22px ${t.padX}px`, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK70, lineHeight: 1.5 }}>
        A scheduled item on the diary. Tap reschedule to move it to another day.
      </div>
      <div style={{ height: 90 }} />
    </>
  );
}

// Expose
Object.assign(window, { BSSheetProvider, useBSSheet, BSToast, BSCalendarScreen, BSEventSheet });
