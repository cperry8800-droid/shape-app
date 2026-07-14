import React from 'react';
import { createPortal } from 'react-dom';
import { BS_CLIENT_WEEK_DEMO, BS_CLIENT_WORKOUTS } from './bsClientWeekDemo.js';
const _BS_CAL_KIND_ICON = { WORKOUT: '🏋', MEAL: '🍽', CHECKIN: '✅', CONSULT: '💬', REVIEW: '📋', PLAN: '🗺', REST: '😴', ADMIN: '✦' };
// iosAppBroadsheetCalendar.jsx — Sheet overlay system + Week/Month calendar screen.
// Newspaper-styled. Role-aware events (client / trainer / nutritionist).

const { useState: useStateBSCal, useEffect: useEffectBSCal, useContext: useContextBSCal, createContext: createContextBSCal, useRef: useRefBSCal } = React;
const { useBS: useBSCal, BSPage: BSPageCal, BSPageHeader: BSPageHeaderCal, BSAvatar: BSAvatarCal, BSEyebrow: BSEyebrowCal, BSSection: BSSectionCal, BSTag: BSTagCal, BSFooter: BSFooterCal } = window;

// Shared schedule formatting — keeps the calendar in sync with the day-log and
// meal previews. Meal events carry a `slot` (BFAST/LUNCH/SNACK/DINNER) and read
// the client's meal-time preference (window.ShapeMealTimes, set in Settings), so
// changing a meal time updates everywhere. All times render 12-hour.
function bsCalEventTime(ev) {
  if (ev && ev.kind === 'MEAL' && ev.slot && typeof window !== 'undefined' && window.ShapeMealTimes) {
    const mt = window.ShapeMealTimes.get();
    if (mt && mt[ev.slot]) return mt[ev.slot];
  }
  return (ev && ev.time) || '—';
}
function bsCalFmt12(hhmm) {
  if (!hhmm || hhmm === '—') return hhmm || '—';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
}
function bsCalTimeLabel(ev) { return bsCalFmt12(bsCalEventTime(ev)); }

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
      <div onClick={e => e.stopPropagation()} className="bs-hide-scroll" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: 0,
        background: t.PAPER, color: t.INK,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'transform 240ms cubic-bezier(0.2,0.8,0.2,1)',
        overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none',
        borderTop: 0, boxShadow: '0 -20px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ position: 'sticky', top: 0, background: t.PAPER, zIndex: 2, borderBottom: `1px solid ${t.RULE}`, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '11px 0 9px', minHeight: 24 }}>
            <button onClick={onDismiss} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 0, color: t.INK,
              fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
              fontWeight: 700, cursor: 'pointer', padding: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>← Back</button>
            <div style={{ width: 36, height: 3, background: t.INK, opacity: 0.4, borderRadius: 999 }} />
          </div>
        </div>
        <div style={{ position: 'relative' }}>
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
  // Built from the SHARED client demo week (bsClientWeekDemo.js) — the same source
  // the home week strip reads — so a given weekday shows the same workouts / meals /
  // consults in both views. The authored week sits on May 11-17 (Mon-Sun); the
  // workout (TRN) items are repeated on adjacent weeks for month-view density.
  const ACC = { TRN: t.AMBER, MEAL: t.BLUE, CHK: t.GREEN, CON: t.RUST, REST: t.INK50 };
  const out = [];
  BS_CLIENT_WEEK_DEMO.forEach((day, idx) => {
    const d = 11 + idx; // May 11 (Mon) .. 17 (Sun)
    day.forEach((it) => out.push({
      day: d, time: it.time,
      dur: it.dur || (it.kind === 'TRN' ? 60 : it.kind === 'CON' ? 30 : 0),
      kind: it.kind, title: it.title, sub: it.sub, accent: ACC[it.kind] || t.RUST, state: it.state,
    }));
    // Density: same workout on the previous week (done) + the next two weeks.
    day.filter((it) => it.kind === 'TRN').forEach((it) => {
      [[d - 7, 'done'], [d + 7, undefined], [d + 14, undefined]].forEach(([dd, st]) => {
        if (dd >= 1 && dd <= 31) out.push({ day: dd, time: it.time, dur: it.dur || 60, kind: 'TRN', title: it.title, sub: it.sub, accent: t.AMBER, state: st });
      });
    });
  });
  return out;
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
// Map a server /api/calendar event (date 'YYYY-MM-DD', time 'HH:MM') to the
// component's shape ({ day, time, dur, kind, title, sub, accent, ... }).
// One kind → color map, on the HOUSE tokens (owner-approved calendar pass,
// 2026-07-13): training rust · meals teal · check-in blue · consult/plan gold —
// the same language the home slate tags and the day-list spines speak, so the
// grid dots, legend, and rows can never disagree. The calendar's old private
// palette (workout amber / meals blue / check-in green) died here.
const bsCalTeal = (t) => (t.isLight ? '#0a8f87' : '#34d6c5');
const _BS_CAL_ACCENTS = (t) => {
  const teal = bsCalTeal(t);
  return {
    WORKOUT: t.RUST, TRN: t.RUST, SES: t.RUST, SESSION: t.RUST,
    MEAL: teal, CHECKIN: t.BLUE, CHK: t.BLUE,
    CONSULT: t.AMBER, CON: t.AMBER, REVIEW: t.AMBER, PLAN: t.AMBER, ADMIN: t.AMBER, ADM: t.AMBER,
    REST: t.INK50,
  };
};
function _bsMapServerCalEvent(ev, t) {
  const [, , dd] = (ev.date || '').split('-');
  const accents = _BS_CAL_ACCENTS(t);
  return {
    id: ev.id,
    source: ev.source,
    editable: ev.editable !== false && ev.source === 'event',
    day: Number(dd) || null,
    date: ev.date,
    time: ev.time || '—',
    dur: ev.durationMin || 0,
    kind: ev.kind || 'ADMIN',
    title: ev.title || '',
    sub: ev.sub || '',
    accent: accents[ev.kind] || t.RUST,
    state: ev.status === 'done' || ev.status === 'completed' ? 'done' : undefined,
    meetingUrl: ev.meetingUrl || null,
    // Live coaching bookings (source 'session') carry their sessions-table id +
    // status so the event sheet can write real completes/reschedules through
    // /api/sessions/manage instead of toasting.
    sessionId: ev.sessionId || null,
    status: ev.status || null,
    reschedulable: ev.reschedulable !== false,
  };
}

function BSCalendarScreen({ role = 'client', onProfile, initialMode = 'week', onBack, clientId = null }) {
  const t = useBSCal();
  const isLoggedInNow = () => !!(typeof window !== 'undefined' && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user);
  const [loggedIn, setLoggedIn] = useStateBSCal(isLoggedInNow);
  const _today = new Date();
  // Default to the real current month (live), or the May 2026 demo when logged out.
  const [viewYear, setViewYear] = useStateBSCal(loggedIn ? _today.getFullYear() : 2026);
  const [viewMonth, setViewMonth] = useStateBSCal(loggedIn ? _today.getMonth() : 4);
  const [selDay, setSelDay] = useStateBSCal(loggedIn ? _today.getDate() : 14);
  const [serverEvents, setServerEvents] = useStateBSCal(null);
  const [showAdd, setShowAdd] = useStateBSCal(false);
  // The auth cache can hydrate just AFTER this screen mounts; if we read "logged
  // out" at first paint we'd be stuck on the May-demo view and never load live
  // events. Re-check shortly + on identity changes; on first detecting a session,
  // jump to the real current month so loadMonth fetches the account's events.
  useEffectBSCal(() => {
    if (loggedIn) return undefined;
    const recheck = () => {
      if (!isLoggedInNow()) return;
      const now = new Date();
      setLoggedIn(true);
      setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); setSelDay(now.getDate());
    };
    const id = setTimeout(recheck, 800);
    if (typeof window !== 'undefined') window.addEventListener('shape:identity', recheck);
    return () => { clearTimeout(id); if (typeof window !== 'undefined') window.removeEventListener('shape:identity', recheck); };
  }, [loggedIn]);

  const pad = (n) => String(n).padStart(2, '0');
  const loadMonth = React.useCallback(() => {
    if (!loggedIn || !window.ShapeCalendar) { setServerEvents(null); return; }
    const from = `${viewYear}-${pad(viewMonth + 1)}-01`;
    const to = `${viewYear}-${pad(viewMonth + 1)}-${new Date(viewYear, viewMonth + 1, 0).getDate()}`;
    window.ShapeCalendar.list({ from, to, clientId })
      .then(d => setServerEvents((d.events || []).map(e => _bsMapServerCalEvent(e, t))))
      .catch(() => setServerEvents([]));
  }, [loggedIn, viewYear, viewMonth, clientId]);
  React.useEffect(() => { loadMonth(); }, [loadMonth]);

  // Trainer/nutritionist demo events are authored on days 20-26 and remapped onto
  // the current demo week. Client events are already authored on real May days
  // (from the shared week), so they skip the remap.
  const sourceDayByDate = { 20: 11, 21: 14, 22: 15, 23: 16, 24: 17, 25: 18, 26: 19 };
  const demoEvents = React.useMemo(() => {
    const evs = eventsFor(role, t);
    if (role === 'client') return evs;
    return evs.map((event) => {
      const day = sourceDayByDate[event.day];
      return day ? { ...event, day } : event;
    });
  }, [role, t]);
  const useServer = loggedIn && serverEvents != null;
  const events = useServer ? serverEvents : demoEvents;
  const sheet = useBSSheet();
  // Demo month = the authored May-2026 preview, shown ONLY when logged out. It's
  // the sole month that renders the demo events and the only one that pins
  // "today" to the 14th. A live account is NEVER a demo month — it shows its real
  // current month with the real "today".
  const isDemoMonth = !useServer && viewYear === 2026 && viewMonth === 4;
  // Which events the month grid actually renders: the live account's events on
  // any month, the demo set on the demo month, and nothing on a logged-out
  // non-demo month (the demo events are only authored for May 2026).
  const monthEvents = (useServer || isDemoMonth) ? events : [];
  const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][viewMonth];

  // Serif page title removed (owner request) — the mast row + Calendar kicker carry the page.

  // Back moved OUT of the trailing corner into BSPageHeader's universal back
  // slot (own row, flush left, under the mast — owner call 2026-07-14).
  const trailing = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {(() => {
        // The real self avatar — initials · photo · tier color · live dot —
        // rendered exactly like every other page header. The self helpers already
        // resolve signed-in (the real account) vs signed-out (the demo persona +
        // its headshot), so there's no page-local demo fallback to drift: the old
        // `signedIn ? … : roleInit` gate showed a stale hardcoded "A" in preview
        // instead of the demo persona's photo/initials/tier.
        const W = typeof window !== 'undefined' ? window : {};
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const init = (W.bsMyInitials && W.bsMyInitials()) || 'S';
        const color = (W.bsMyTierColor && W.bsMyTierColor()) || teal;
        const photo = (W.bsMyPhoto && W.bsMyPhoto()) || undefined;
        const live = !!(W.bsAmLive && W.bsAmLive());
        const FA = W.BSFacetAvatar;
        if (FA) return React.createElement(FA, { size: 32, c: color, initial: init, photo, live, showRank: false, onClick: onProfile });
        return <BSAvatarCal init={init} size={32} fill={color} ink={role !== 'client' ? t.PAPER : null} onClick={onProfile} />;
      })()}
    </div>
  );

  return (
    <BSPageCal>
      <BSPageHeaderCal
        kicker="Section · Calendar"
        trailing={trailing}
        onBack={onBack}
      />

      {useServer && (
        <div style={{ padding: `10px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
          <button onClick={() => setShowAdd(true)} style={{
            width: '100%', padding: '11px 0', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
            fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
          }}>+ Add to calendar</button>
        </div>
      )}

      <BSCalendarMonth
        events={monthEvents}
        viewYear={viewYear}
        viewMonth={viewMonth}
        monthName={monthName}
        isDemoMonth={isDemoMonth}
        selDay={selDay}
        setSelDay={setSelDay}
        sheet={sheet}
        role={role}
        live={useServer}
        onChanged={loadMonth}
        onPrev={() => { let m = viewMonth - 1, y = viewYear; if (m < 0) { m = 11; y -= 1; } setViewMonth(m); setViewYear(y); }}
        onNext={() => { let m = viewMonth + 1, y = viewYear; if (m > 11) { m = 0; y += 1; } setViewMonth(m); setViewYear(y); }}
      />

      <BSFooterCal left="The Shape Daily · Calendar" right={`${monthName} · ${viewYear}`} />
      {showAdd && (
        <BSCalAddSheet
          year={viewYear} month={viewMonth} day={selDay}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadMonth(); }}
        />
      )}
    </BSPageCal>
  );
}

// Add-event bottom sheet (writes to /api/calendar via ShapeCalendar.create).
function BSCalAddSheet({ year, month, day, onClose, onSaved }) {
  const t = useBSCal();
  const KINDS = ['WORKOUT', 'MEAL', 'CHECKIN', 'CONSULT', 'REVIEW', 'PLAN', 'REST', 'ADMIN'];
  const [kind, setKind] = useStateBSCal('WORKOUT');
  const [title, setTitle] = useStateBSCal('');
  const [sub, setSub] = useStateBSCal('');
  const [time, setTime] = useStateBSCal('');
  const [dur, setDur] = useStateBSCal('');
  const [busy, setBusy] = useStateBSCal(false);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;

  const save = async () => {
    if (!title.trim()) { window.__bsToast?.('Add a title', 'err'); return; }
    setBusy(true);
    try {
      await window.ShapeCalendar.create({
        kind, title: title.trim(), sub: sub.trim() || undefined,
        date: dateStr, time: /^\d{1,2}:\d{2}$/.test(time) ? time : undefined,
        durationMin: dur ? Number(dur) : undefined,
      });
      window.__bsToast?.('Added to calendar', 'ok');
      onSaved?.();
    } catch (e) {
      window.__bsToast?.(e?.message || 'Could not save', 'err');
    } finally {
      setBusy(false);
    }
  };

  const input = (val, setVal, ph, type = 'text') => (
    <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={ph} type={type}
      style={{ width: '100%', height: 46, background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: 12, padding: '0 14px', fontFamily: t.BODY || t.DISPLAY, fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
  );
  const niceDate = (() => { const d = new Date(dateStr + 'T00:00:00'); return isNaN(d) ? dateStr : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); })();

  return createPortal((
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, maxHeight: '92vh', overflowY: 'auto', background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '10px 18px calc(20px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -24px 70px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 99, background: t.RULE }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: t.W.display, letterSpacing: '-0.025em' }}>Add to calendar</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>{niceDate}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK50, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, marginBottom: 9 }}>Type</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 18 }}>
          {KINDS.map(k => {
            const on = k === kind;
            return (
              <button key={k} onClick={() => setKind(k)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 2px 7px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? t.ACCENT : t.RULE}`, background: on ? `${t.ACCENT}22` : 'transparent' }}>
                <span style={{ fontSize: 17, lineHeight: 1, filter: on ? 'none' : 'grayscale(0.4)' }}>{_BS_CAL_KIND_ICON[k] || '✦'}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', color: on ? t.INK : t.INK50 }}>{k}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'grid', gap: 9, marginBottom: 18 }}>
          {input(title, setTitle, 'Title (e.g. Upper Push)')}
          {input(sub, setSub, 'Details (optional)')}
          <div style={{ display: 'flex', gap: 9 }}>
            {input(time, setTime, 'Time HH:MM', 'text')}
            {input(dur, setDur, 'Min', 'number')}
          </div>
        </div>
        <button onClick={save} disabled={busy} style={{ width: '100%', padding: '16px 0', borderRadius: 999, background: t.ACCENT, color: '#031f1c', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>{busy ? 'Saving…' : 'Add to calendar →'}</button>
      </div>
    </div>
  ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body);
}

// ────────── WEEK VIEW

// Day timeline — vertical, each event a row. Mark "now" (8:30 AM May 14) and gaps.

// ────────── MONTH VIEW
function BSCalendarMonth({ events, viewYear, viewMonth, monthName, isDemoMonth, selDay, setSelDay, sheet, role, live = false, onChanged = () => {}, onPrev = () => {}, onNext = () => {} }) {
  const t = useBSCal();
  const teal = bsCalTeal(t);
  const MONTHS3 = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const prevAbbr = MONTHS3[(viewMonth + 11) % 12];
  const nextAbbr = MONTHS3[(viewMonth + 1) % 12];
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
  // Display color resolves through the ONE kind map (house tokens) with the
  // event's stored accent as the fallback — demo arrays keep their authored
  // accents in data, but every rendered dot/spine speaks the house language.
  const kindAccent = _BS_CAL_ACCENTS(t);
  const accentOf = (e) => kindAccent[e.kind] || e.accent || t.RUST;

  return (
    <>
      {/* Month headline — serif month (teal italic) + inline prev/next nav */}
      <div style={{ padding: `18px ${t.padX}px 10px`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 30, letterSpacing: '-0.035em', lineHeight: 1, color: t.INK }}>
          <span style={{ fontStyle: 'italic', color: teal }}>{monthName}</span> <span>{viewYear}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onPrev} aria-label="Previous month" style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>‹ {prevAbbr}</button>
          <button onClick={onNext} aria-label="Next month" style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{nextAbbr} ›</button>
        </div>
      </div>

      {/* DOW header — single letters */}
      <div style={{ padding: `2px ${t.padX}px 6px`, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', color: t.INK50, fontWeight: 700, textAlign: 'center' }}>{d}</div>
        ))}
      </div>

      {/* Grid — UNBOXED (owner-approved pass, 2026-07-13): the 31 bordered
          cells die for hairline week rows of bare day numerals + kind dots.
          Selected day = a filled accent disc; today (unselected) = an accent
          numeral. The per-cell count numeral is gone — the dots carry the
          kinds visually, and the aria-label carries the count. */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        {weeks.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${t.HAIR}` }}>
            {row.map((d, ci) => {
              if (d == null) return <div key={ci} aria-hidden />;
              const isToday = d === visualToday;
              const isSel = d === selDay;
              const dayEv = eventsByDay[d] || [];
              const dotsAccents = dayEv.slice(0, 4).map(accentOf);
              return (
                <button key={ci} type="button" onClick={() => setSelDay(d)}
                  aria-label={`${monthName} ${d}${dayEv.length ? `, ${dayEv.length} ${dayEv.length === 1 ? 'item' : 'items'}` : ''}${isSel ? ', selected' : ''}${isToday ? ', today' : ''}`}
                  style={{ background: 'transparent', border: 0, cursor: 'pointer', minHeight: 44, padding: '7px 0 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 13, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', background: isSel ? teal : 'transparent', color: isSel ? t.PAPER : (isToday ? teal : t.INK70) }}>{d}</span>
                  <span style={{ display: 'flex', gap: 2.5, height: 4, overflow: 'hidden' }}>
                    {dotsAccents.map((c, k) => (
                      <span key={k} style={{ width: 4, height: 3.5, borderRadius: 1, background: c, display: 'inline-block', flex: '0 0 auto' }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend — derived from the SAME kind map the dots + spines resolve
          through, so the three can never disagree. */}
      <div style={{ padding: `10px ${t.padX}px 8px`, display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
        {[['Training', 'TRN'], ['Meals', 'MEAL'], ['Check-in', 'CHECKIN'], ['Consult', 'CONSULT']].map(([l, k]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>
            <span style={{ width: 7, height: 7, borderRadius: 1.5, background: kindAccent[k], display: 'inline-block' }} />{l}
          </span>
        ))}
      </div>

      {/* Month register — figure-over-label columns (was a one-line tally) */}
      {monthTotal > 0 && (
        <div style={{ margin: `4px ${t.padX}px 14px`, borderTop: `2px solid ${t.INK}`, paddingTop: 8, display: 'flex' }}>
          {/* "Open", not "Ahead" — a browsed past month's never-completed
              events are open items, not upcoming ones. */}
          {[[monthTotal, 'This month', t.INK], [doneCount, 'Done', teal], [monthTotal - doneCount, 'Open', t.INK]].map(([v, l, c]) => (
            <div key={l} style={{ flex: 1 }}>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 18, letterSpacing: '-0.03em', color: c, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{v}</div>
              <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Day reader (inline — replaces the old week-strip drilldown) */}
      {(() => {
        const dayEv = (eventsByDay[selDay] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
        const dowFull = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
        const selDow = dowFull[(new Date(viewYear, viewMonth, selDay).getDay() + 6) % 7];
        return (
          <>
            <div style={{ padding: `14px ${t.padX}px 10px`, borderTop: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 700 }}>
                <span style={{ color: teal }}>▍</span> Day · {selDow} {monthName.slice(0,3)} {selDay}
              </div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
                {dayEv.length} {dayEv.length === 1 ? 'item' : 'items'}
              </div>
            </div>
            {dayEv.length === 0 ? (
              <div style={{ padding: `4px ${t.padX}px 18px`, fontFamily: t.MONO, fontSize: 10, color: t.INK50, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600 }}>
                — Nothing logged —
              </div>
            ) : (
              <div style={{ padding: `0 ${t.padX}px 18px` }}>
                {dayEv.map((e, i) => {
                  const done = e.state === 'done';
                  return (
                  <button key={i} onClick={() => sheet && sheet.open(<BSEventSheet event={e} role={role} live={live} onChanged={onChanged} onClose={() => sheet.close()} />)} style={{
                    width: '100%', padding: '13px 0', background: 'transparent', border: 0,
                    borderBottom: i === dayEv.length - 1 ? 0 : `1px solid ${t.HAIR}`,
                    textAlign: 'left', cursor: 'pointer',
                    display: 'grid', gridTemplateColumns: '50px 1fr auto', alignItems: 'center', gap: 11,
                  }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700, color: done ? t.INK50 : t.INK, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>
                      {bsCalTimeLabel(e)}
                      <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, fontWeight: 600, letterSpacing: '0.08em', marginTop: 3 }}>{e.dur ? `${e.dur} MIN` : ''}</div>
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'stretch', gap: 11 }}>
                      <span style={{ width: 3, alignSelf: 'stretch', minHeight: 30, borderRadius: 999, background: accentOf(e), flex: '0 0 auto' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', color: accentOf(e), textTransform: 'uppercase' }}>{e.kind}</span>
                          {done && <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.16em', fontWeight: 700 }}>✓ DONE</span>}
                          {e.state === 'now' && <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: teal, letterSpacing: '0.16em', fontWeight: 800 }}>● NOW</span>}
                          {e.state === 'next' && <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK70, letterSpacing: '0.16em', fontWeight: 700 }}>UP NEXT</span>}
                        </div>
                        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 17, letterSpacing: '-0.02em', color: done ? t.INK50 : t.INK, lineHeight: 1.12, textDecoration: done ? 'line-through' : 'none' }}>{e.title}</div>
                        {e.sub && <div style={{ fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK50, marginTop: 2, letterSpacing: '-0.005em' }}>{e.sub}</div>}
                      </div>
                    </div>
                    <span style={{ fontFamily: t.MONO, fontSize: 15, color: t.INK30 }}>›</span>
                  </button>
                  );
                })}
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
function BSEventSheet({ event, role, onClose, live = false, onChanged = () => {} }) {
  const t = useBSCal();
  const canDelete = live && event.editable && event.source === 'event';
  // A live coaching booking (the sessions table) viewed by its coach: the
  // complete/reschedule actions write through /api/sessions/manage (the route
  // re-checks coach ownership server-side). The accountability cron reads
  // status='completed' (award_session_kept), so Mark complete is a real signal.
  const coachSession = live && event.source === 'session' && !!event.sessionId
    && (role === 'trainer' || role === 'nutritionist');
  const [busy, setBusy] = useStateBSCal(false);
  // The ONE guarded door to /api/sessions/manage from this sheet — global
  // checked like the ShapeCalendar calls in this file; confirm/complete and
  // the coach reschedule all pass through it so the guard can never drift.
  const callManageSession = (payload) => {
    if (!window.ShapeSessions?.manageSession) throw new Error('Session actions unavailable — try reloading.');
    return window.ShapeSessions.manageSession(payload);
  };
  // One runner for the booking actions (confirm / complete): busy-locked,
  // honest toasts.
  const runSessionAction = async (action, okMsg) => {
    if (busy) return;
    setBusy(true);
    try {
      await callManageSession({ sessionId: event.sessionId, action });
      window.__bsToast?.(okMsg, 'ok');
      onClose(); onChanged();
    } catch (e) {
      window.__bsToast?.(e?.message || 'Could not update the booking', 'err');
      setBusy(false);
    }
  };
  const removeEvent = async () => {
    if (!(await window.bsAskConfirm({
      title: 'Delete this event?',
      name: event.title || event.name,
      message: 'This permanently removes it from the calendar. This can’t be undone.',
      confirmLabel: 'Delete event',
    }))) return;
    try {
      await window.ShapeCalendar?.remove?.(event.id);
      window.__bsToast?.('Removed', 'ok');
      onClose();
      onChanged();
    } catch (e) {
      window.__bsToast?.('Could not remove', 'err');
    }
  };
  const dateRef = useRefBSCal(null);
  // Who can actually move this entry: an owner-editable calendar event, a
  // coach's still-active booking (the manage route rejects completed ones),
  // or the signed-out demo. A client's live booking hides the button — only
  // the coach can move a real session, and a fake "Rescheduled" toast lied.
  const canReschedule = !live
    || (event.editable && event.source === 'event')
    || (coachSession && event.reschedulable !== false && event.status !== 'completed');
  const reschedule = async (newDate) => {
    if (!newDate || newDate === event.date) return;
    const isLiveEvent = live && event.editable && event.source === 'event';
    if (isLiveEvent) {
      try { await window.ShapeCalendar?.update?.({ id: event.id, date: newDate }); window.__bsToast?.('Rescheduled', 'ok'); onClose(); onChanged(); }
      catch (e) { window.__bsToast?.(e?.message || 'Could not reschedule', 'err'); }
    } else if (coachSession && event.reschedulable !== false && event.status !== 'completed') {
      // Real booking move — same wall-clock slot on the new date; the server
      // validates coach ownership + that the session is still active/upcoming.
      // Re-checks the canReschedule terms because the hidden date input isn't
      // gated by the button — a stray onChange must not reach the server.
      const time = /^\d{1,2}:\d{2}$/.test(String(event.time || '')) ? event.time : undefined;
      try {
        await callManageSession({ sessionId: event.sessionId, action: 'reschedule', date: newDate, time });
        window.__bsToast?.('Rescheduled ✓', 'ok'); onClose(); onChanged();
      }
      catch (e) { window.__bsToast?.(e?.message || 'Could not reschedule', 'err'); }
    } else if (coachSession) {
      window.__bsToast?.('This booking can’t be moved.', 'warn');
    } else if (!live) {
      window.__bsToast?.('Rescheduled', 'ok'); onClose();
    }
  };
  const isWorkout = event.kind === 'TRN' || event.kind === 'SES' || event.kind === 'WORKOUT';
  const isMeal    = event.kind === 'MEAL';
  const isConsult = event.kind === 'CON';
  const isCheck   = event.kind === 'CHK';

  return (
    <div>
      {/* Masthead-ish */}
      <div style={{ padding: `18px ${t.padX}px 18px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <BSTagCal color={event.accent}>{event.kind}</BSTagCal>
          <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', color: t.INK70, fontWeight: 600 }}>{event.date ? new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `May ${event.day}`} · {bsCalTimeLabel(event)}{event.dur ? ` · ${event.dur}m` : ''}</span>
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
      <div style={{ padding: `16px 14px calc(84px + env(safe-area-inset-bottom, 0px))`, background: t.PAPER, borderTop: `1px solid ${t.RULE}`, display: 'flex', gap: 8 }}>
        {coachSession ? (
          // The confirm → complete lifecycle: a REQUESTED booking must be
          // confirmed first (Codex P1 — completing straight from requested
          // would let the cron award a session that was never confirmed);
          // only a CONFIRMED one offers Mark complete.
          event.status === 'completed'
            ? <button onClick={onClose} style={primaryBtn(t)}>Completed ✓</button>
            : event.status === 'confirmed'
              ? <button onClick={() => runSessionAction('complete', 'Session marked complete ✓')} disabled={busy} style={{ ...primaryBtn(t), opacity: busy ? 0.6 : 1 }}>{busy ? 'Marking…' : 'Mark complete'}</button>
              : event.status === 'requested'
                ? <button onClick={() => runSessionAction('confirm', 'Booking confirmed ✓')} disabled={busy} style={{ ...primaryBtn(t), opacity: busy ? 0.6 : 1 }}>{busy ? 'Confirming…' : 'Confirm booking'}</button>
                // Terminal/unknown states (declined/cancelled shouldn't reach the
                // calendar — its GET filters to requested/confirmed/completed, but
                // never offer an action on one): plain close.
                : <button onClick={onClose} style={primaryBtn(t)}>Done</button>
        ) : (
          <>
            {(isWorkout || isMeal) && (
              <button onClick={() => {
                if (role !== 'trainer' && isWorkout) { try { window.dispatchEvent(new Event('shape:startWorkout')); } catch (e) {} onClose(); }
                else { onClose(); window.__bsToast?.('Logged ✓', 'ok'); }
              }} style={primaryBtn(t)}>{role === 'trainer' ? 'Mark complete' : (isMeal ? 'Log meal' : 'Start session →')}</button>
            )}
            {isConsult && <button onClick={() => { if (event.meetingUrl) { try { window.open(event.meetingUrl, '_blank', 'noopener'); } catch (e) {} onClose(); } else { onClose(); window.__bsToast?.('No meeting link yet — your coach will add one.', 'warn'); } }} style={primaryBtn(t)}>Join consult →</button>}
            {isCheck   && <button onClick={() => { onClose(); window.__bsToast?.('Submitted check-in', 'ok'); }} style={primaryBtn(t)}>Submit check-in</button>}
            {!isWorkout && !isMeal && !isConsult && !isCheck && <button onClick={onClose} style={primaryBtn(t)}>Done</button>}
          </>
        )}
        {coachSession && event.meetingUrl && event.status !== 'completed' && (
          <button onClick={() => { try { window.open(event.meetingUrl, '_blank', 'noopener'); } catch (e) {} }} style={secondaryBtn(t)}>Join →</button>
        )}
        <input type="date" ref={dateRef} defaultValue={event.date || ''} onChange={(e) => reschedule(e.target.value)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        {canReschedule && <button onClick={() => { const el = dateRef.current; if (el) { try { el.showPicker ? el.showPicker() : el.click(); } catch (e2) { el.click(); } } }} style={secondaryBtn(t)}>Reschedule</button>}
        {canDelete && <button onClick={removeEvent} style={secondaryBtn(t)}>Delete</button>}
      </div>
    </div>
  );
}

function primaryBtn(t) {
  return { flex: 1, padding: 15, borderRadius: 5, clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', background: t.INK, color: t.PAPER, border: 0, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' };
}
function secondaryBtn(t) {
  return { padding: '15px 18px', borderRadius: 5, background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' };
}

// Shared bare stat register (Open Ledger) — the workout stats + meal macros
// rows render identically: eyebrow-above-figure columns + an ink→accent rule.
function BSEventStatRegister({ t, items, accent }) {
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  return (
    <div style={{ padding: `18px ${t.padX}px 6px` }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {items.map(([l, v], i) => (
          <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.HAIR}` : 0, paddingLeft: i > 0 ? 10 : 0, paddingRight: 6 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, color: v === '—' ? t.INK50 : t.INK, marginTop: 5, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>
      <div aria-hidden style={{ marginTop: 12, height: 2, background: `linear-gradient(90deg, ${t.INK}, ${accent || teal} 62%, transparent)` }} />
    </div>
  );
}

function BSEventWorkoutBody({ event, role }) {
  const t = useBSCal();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // Pull the REAL session for this event by title (shared week → BS_CLIENT_WORKOUTS),
  // so a Z2 run shows run segments — not barbell rows. Falls back gracefully when
  // there's no authored detail (e.g. a live server event).
  const detail = (event.title && typeof BS_CLIENT_WORKOUTS !== 'undefined' && BS_CLIENT_WORKOUTS[event.title]) || null;
  const cardio = !!(detail && detail.cardio);
  const metaParts = detail && detail.meta ? detail.meta.split('·').map(s => s.trim()) : [];
  const findPart = (re) => metaParts.find(p => re.test(p)) || '';
  const kcal = (findPart(/kcal/i).match(/\d+/) || [])[0] || '';
  const rpe = (findPart(/rpe/i).match(/\d+(?:\.\d+)?/) || [])[0] || '';
  const zone = cardio ? (metaParts.find(p => /zone|easy|aerobic|tempo|steady/i.test(p)) || '') : '';
  const dist = cardio ? ((metaParts.find(p => /\d\s*k\b|km/i.test(p)) || '').replace(/~/g, '')) : '';
  const moves = detail
    ? detail.moves.map((m, j) => ({ n: String(j + 1).padStart(2, '0'), m: m.name, s: m.scheme || '—', l: cardio ? '' : (m.load || '—') }))
    : null;
  const durLabel = event.dur ? `${event.dur}m` : (metaParts[0] || '—');
  // Honest register — never a fabricated figure (RPE was defaulting to '8' on
  // events with no authored detail, e.g. a coach's live booking).
  const stats = cardio
    ? [['DUR', durLabel], ['DIST', dist || '—'], ['ZONE', zone || '—'], ['KCAL', kcal || '—']]
    : [['DUR', durLabel], ['MOVES', moves ? String(moves.length) : '—'], ['RPE', rpe || '—'], ['KCAL', kcal || '—']];
  const isCoach = role === 'trainer' || role === 'nutritionist';

  return (
    <>
      {/* Register — bare eyebrow-above-figure columns + an ink→accent rule (Open Ledger) */}
      <BSEventStatRegister t={t} items={stats} accent={event.accent} />

      {/* Coach's cue — accent-spine block, no box */}
      {detail && detail.note && (
        <div style={{ padding: `10px ${t.padX}px 0` }}>
          <div style={{ borderLeft: `3px solid ${event.accent || teal}`, padding: '2px 0 2px 11px' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, marginBottom: 4 }}>Coach’s cue</div>
            <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, color: t.INK70, lineHeight: 1.45, letterSpacing: '-0.005em' }}>{detail.note}</div>
          </div>
        </div>
      )}

      {/* The card / the session — dot-leader ledger rows */}
      {moves ? (
        <>
          <div style={{ padding: `14px ${t.padX}px 2px`, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 800 }}><span aria-hidden style={{ width: 10, height: 2, background: event.accent || teal, display: 'inline-block' }} /> {cardio ? 'The session' : 'The card'}</div>
          <div style={{ padding: `0 ${t.padX}px` }}>
            {moves.map((r, i) => (
              <div key={i} style={{ borderTop: i ? `1px solid ${t.HAIR}` : 0, padding: `${t.rowY + 2}px 0` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600 }}>{r.n}</span>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.m}</span>
                  {!cardio && <><span aria-hidden style={{ flex: 1, minWidth: 14, borderBottom: `1px dotted ${t.INK}4d`, transform: 'translateY(-3px)' }} /><span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 11.5, color: t.INK, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{r.l}</span></>}
                </div>
                <div style={{ marginTop: 2, paddingLeft: 18, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{r.s}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: `14px ${t.padX}px 4px` }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.5, letterSpacing: '-0.005em' }}>
            {event.sub ? `${event.sub} — ` : ''}{isCoach ? 'the full log lands here once the session is done; manage the client from Clients → their Case File.' : 'open the Train tab for the full session card.'}
          </div>
        </div>
      )}
      {/* Padding for sticky footer */}
      <div style={{ height: 12 }} />
    </>
  );
}

function BSEventMealBody({ event }) {
  const t = useBSCal();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // Read what the event tells us (sub e.g. "620 kcal · 48P") and derive the rest so
  // the macros stay consistent with THIS meal's title — never a contradictory plate.
  const sub = event.sub || '';
  const kcalN = (() => { const m = sub.match(/(\d+)\s*kcal/i); return m ? Number(m[1]) : null; })();
  const proN  = (() => { const m = sub.match(/(\d+)\s*P\b/i);  return m ? Number(m[1]) : null; })();
  let carbN = null, fatN = null;
  if (kcalN != null && proN != null) {
    const rem = Math.max(0, kcalN - proN * 4);
    fatN = Math.round((rem * 0.35) / 9);
    carbN = Math.round((rem * 0.65) / 4);
  }
  const macros = [
    ['KCAL', kcalN != null ? String(kcalN) : '—'],
    ['PRO',  proN != null ? `${proN}g` : '—'],
    ['CARB', carbN != null ? `${carbN}g` : '—'],
    ['FAT',  fatN != null ? `${fatN}g` : '—'],
  ];
  const pCal = (proN || 0) * 4, cCal = (carbN || 0) * 4, fCal = (fatN || 0) * 9;
  const totCal = pCal + cCal + fCal;
  const splitOk = totCal > 0 && carbN != null;
  // "On the plate" — components from the title (no invented quantities).
  const plate = String(event.title || '')
    .split(/\s*(?:,|\+|&|\bwith\b|\band\b|\/)\s*/i)
    .map(s => s.trim()).filter(Boolean).slice(0, 6);

  return (
    <>
      {/* Macro register — bare eyebrow-above-figure columns + ink→accent rule */}
      <BSEventStatRegister t={t} items={macros} accent={event.accent} />

      {/* Macro split bar (by calories) */}
      {splitOk && (
        <div style={{ padding: `8px ${t.padX}px 2px` }}>
          <div style={{ display: 'flex', height: 8, borderRadius: 3, overflow: 'hidden', border: `1px solid ${t.HAIR}` }}>
            <span style={{ width: `${(pCal / totCal) * 100}%`, background: teal }} />
            <span style={{ width: `${(cCal / totCal) * 100}%`, background: t.AMBER }} />
            <span style={{ width: `${(fCal / totCal) * 100}%`, background: t.RUST }} />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 7, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
            <span><span style={{ color: teal }}>●</span> {Math.round(pCal / totCal * 100)}% Pro</span>
            <span><span style={{ color: t.AMBER }}>●</span> {Math.round(cCal / totCal * 100)}% Carb</span>
            <span><span style={{ color: t.RUST }}>●</span> {Math.round(fCal / totCal * 100)}% Fat</span>
          </div>
        </div>
      )}

      {/* On the plate */}
      {plate.length > 0 && (
        <>
          <div style={{ padding: `14px ${t.padX}px 2px`, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 800 }}><span aria-hidden style={{ width: 10, height: 2, background: event.accent || teal, display: 'inline-block' }} /> On the plate</div>
          <div style={{ padding: `0 ${t.padX}px` }}>
            {plate.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderTop: i ? `1px solid ${t.HAIR}` : 0, padding: `${t.rowY + 2}px 0` }}>
                <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em', textTransform: 'capitalize' }}>{p}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ height: 12 }} />
    </>
  );
}

function BSEventConsultBody({ event, role }) {
  const t = useBSCal();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // The agenda + last-consult notes are authored DEMO content — never show them
  // on a real (server) event, where they'd read as fabricated client data.
  const isDemo = event.source !== 'event';
  const agenda = isDemo ? ['Macro update for cut phase', 'Sleep review · last 7 nights', 'Restaurant strategy for weekend'] : [];
  return (
    <>
      <div style={{ padding: `18px ${t.padX}px 16px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 800, marginBottom: 4 }}><span aria-hidden style={{ width: 10, height: 2, background: event.accent || teal, display: 'inline-block' }} /> Agenda</div>
        {agenda.length ? agenda.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderTop: i ? `1px solid ${t.HAIR}` : 0, padding: '9px 0' }}>
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>{a}</span>
          </div>
        )) : (
          <div style={{ padding: '9px 0', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>No agenda attached · set one when booking</div>
        )}
      </div>
      {isDemo && (
        <>
          <div style={{ padding: `18px ${t.padX}px 8px`, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 800 }}><span aria-hidden style={{ width: 10, height: 2, background: event.accent || teal, display: 'inline-block' }} /> Notes from last consult</div>
          <div style={{ padding: `0 ${t.padX}px 18px` }}>
            <div style={{ borderLeft: `3px solid ${event.accent || teal}`, padding: '2px 0 2px 11px', fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, color: t.INK70, lineHeight: 1.5, letterSpacing: '-0.005em' }}>
              “Cut went well into week 5. Energy held. Add 200 kcal to refeed Saturdays — avoid mid-cut plateau.”
            </div>
          </div>
        </>
      )}
      <div style={{ height: 6 }} />
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
      <div style={{ height: 6 }} />
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
      <div style={{ height: 6 }} />
    </>
  );
}

// Expose
Object.assign(window, { BSSheetProvider, useBSSheet, BSToast, BSCalendarScreen, BSEventSheet });
