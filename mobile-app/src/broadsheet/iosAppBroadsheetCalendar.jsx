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
const _BS_CAL_ACCENTS = (t) => ({
  WORKOUT: t.AMBER, TRN: t.AMBER, SES: t.AMBER, SESSION: t.AMBER,
  MEAL: t.BLUE, CHECKIN: t.GREEN, CHK: t.GREEN,
  CONSULT: t.RUST, CON: t.RUST, REVIEW: t.RUST, PLAN: t.RUST, ADMIN: t.RUST, ADM: t.RUST,
  REST: t.INK50,
});
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
    state: ev.status === 'done' ? 'done' : undefined,
    meetingUrl: ev.meetingUrl || null,
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

  const masthead = role === 'trainer' ? <>The<br/>schedule.</>
                : role === 'nutritionist' ? <>The<br/>diary.</>
                : <>Month's<br/>plan.</>;

  const trailing = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {onBack && (
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          padding: '6px 12px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
        }}>← Back</button>
      )}
      {(() => {
        // Real signed-in avatar (initials · photo · tier color) like every other
        // header; the role-based demo initials are the signed-out preview only.
        const W = typeof window !== 'undefined' ? window : {};
        const signedIn = !!(W.ShapeAuth && W.ShapeAuth.getCachedState && W.ShapeAuth.getCachedState() && W.ShapeAuth.getCachedState().user && W.ShapeAuth.getCachedState().user.id);
        const roleInit = role === 'trainer' ? 'J' : role === 'nutritionist' ? 'M' : 'A';
        const roleColor = role === 'trainer' ? t.AMBER : role === 'nutritionist' ? t.RUST : (t.isLight ? '#0a8f87' : '#34d6c5');
        const init = signedIn ? ((W.bsMyInitials && W.bsMyInitials()) || roleInit) : roleInit;
        const color = signedIn ? ((W.bsMyTierColor && W.bsMyTierColor()) || roleColor) : roleColor;
        const photo = signedIn ? ((W.bsMyPhoto && W.bsMyPhoto()) || (W.ShapeIdentity && W.ShapeIdentity.photo) || undefined) : undefined;
        const live = !!(signedIn && W.bsAmLive && W.bsAmLive());
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
        title={masthead}
        trailing={trailing}
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
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
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

      {/* Grid — clean, compact day cells */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        {weeks.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {row.map((d, ci) => {
              if (d == null) return <div key={ci} />;
              const isToday = d === visualToday;
              const isSel = d === selDay;
              const dayEv = eventsByDay[d] || [];
              const dotsAccents = dayEv.slice(0, 4).map(e => e.accent);
              return (
                <button key={ci} onClick={() => setSelDay(d)} style={{
                  borderRadius: 4, position: 'relative',
                  border: isSel ? `1.5px solid ${teal}` : isToday ? `1px solid ${teal}88` : `1px solid ${t.HAIR}`,
                  background: isSel ? `${teal}1c` : t.PAPER2,
                  color: t.INK, boxSizing: 'border-box', overflow: 'hidden',
                  aspectRatio: '1 / 1', padding: '5px 5px 4px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 3,
                  fontFamily: t.DISPLAY,
                }}>
                  {isSel && <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: teal }} />}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
                    <span style={{ fontWeight: t.W.display, fontSize: 14, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', color: isToday ? teal : t.INK }}>{d}</span>
                    {dayEv.length > 0 && <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, color: t.INK50, letterSpacing: '0.02em' }}>{dayEv.length}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 2.5, height: 5, overflow: 'hidden' }}>
                    {dotsAccents.map((c, k) => (
                      <span key={k} style={{ width: 4.5, height: 4.5, borderRadius: 1, background: c, display: 'inline-block', flex: '0 0 auto' }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ padding: `8px ${t.padX}px 8px`, display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
        {[['Workout', t.AMBER], ['Meals', t.BLUE], ['Check-in', t.GREEN], ['Consult', t.RUST]].map(([l, c]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>
            <span style={{ width: 7, height: 7, borderRadius: 1.5, background: c, display: 'inline-block' }} />{l}
          </span>
        ))}
      </div>

      {/* Month tally — items this month, done vs ahead */}
      {monthTotal > 0 && (
        <div style={{ padding: `0 ${t.padX}px 14px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
          {monthTotal} this month · <span style={{ color: teal, fontWeight: 800 }}>{doneCount} done</span> · {monthTotal - doneCount} ahead
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
                      <span style={{ width: 3, alignSelf: 'stretch', minHeight: 30, borderRadius: 999, background: e.accent, flex: '0 0 auto' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', color: e.accent, textTransform: 'uppercase' }}>{e.kind}</span>
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
  const reschedule = async (newDate) => {
    if (!newDate || newDate === event.date) return;
    const isLive = live && event.editable && event.source === 'event';
    if (isLive) {
      try { await window.ShapeCalendar?.update?.({ id: event.id, date: newDate }); window.__bsToast?.('Rescheduled', 'ok'); onClose(); onChanged(); }
      catch (e) { window.__bsToast?.(e?.message || 'Could not reschedule', 'err'); }
    } else {
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
        {(isWorkout || isMeal) && (
          <button onClick={() => {
            if (role !== 'trainer' && isWorkout) { try { window.dispatchEvent(new Event('shape:startWorkout')); } catch (e) {} onClose(); }
            else { onClose(); window.__bsToast?.('Logged ✓', 'ok'); }
          }} style={primaryBtn(t)}>{role === 'trainer' ? 'Mark complete' : (isMeal ? 'Log meal' : 'Start session →')}</button>
        )}
        {isConsult && <button onClick={() => { if (event.meetingUrl) { try { window.open(event.meetingUrl, '_blank', 'noopener'); } catch (e) {} onClose(); } else { onClose(); window.__bsToast?.('No meeting link yet — your coach will add one.', 'warn'); } }} style={primaryBtn(t)}>Join consult →</button>}
        {isCheck   && <button onClick={() => { onClose(); window.__bsToast?.('Submitted check-in', 'ok'); }} style={primaryBtn(t)}>Submit check-in</button>}
        {!isWorkout && !isMeal && !isConsult && !isCheck && <button onClick={onClose} style={primaryBtn(t)}>Done</button>}
        <input type="date" ref={dateRef} defaultValue={event.date || ''} onChange={(e) => reschedule(e.target.value)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        <button onClick={() => { const el = dateRef.current; if (el) { try { el.showPicker ? el.showPicker() : el.click(); } catch (e2) { el.click(); } } }} style={secondaryBtn(t)}>Reschedule</button>
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
  const stats = cardio
    ? [['DUR', durLabel], ['DIST', dist || '—'], ['ZONE', zone || 'Z2'], ['KCAL', kcal || '—']]
    : [['DUR', durLabel], ['MOVES', moves ? String(moves.length) : '—'], ['RPE', rpe || '8'], ['KCAL', kcal || '—']];

  return (
    <>
      {/* Stat row — squared instrument plate w/ event-accent spine */}
      <div style={{ padding: `16px ${t.padX}px 6px` }}>
        <div style={{ borderRadius: 6, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${event.accent || teal}`, background: t.PAPER2, padding: '14px 6px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {stats.map(([l, v], i) => (
            <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.HAIR}` : 0, paddingLeft: 10, paddingRight: 6 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 19, color: t.INK, marginTop: 4, letterSpacing: '-0.03em' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Coach's cue */}
      {detail && detail.note && (
        <div style={{ padding: `10px ${t.padX}px 0` }}>
          <div style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: `${event.accent}10`, borderLeft: `3px solid ${event.accent}`, padding: '11px 13px' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, marginBottom: 5 }}>Coach’s cue</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.45, letterSpacing: '-0.005em' }}>{detail.note}</div>
          </div>
        </div>
      )}

      {/* The card / the session */}
      {moves ? (
        <>
          <div style={{ padding: `14px ${t.padX}px 6px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}><span style={{ color: teal }}>▍</span> {cardio ? 'The session' : 'The card'}</div>
          <div style={{ padding: `0 ${t.padX}px` }}>
            <div style={{ borderRadius: 6, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
              {moves.map((r, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: cardio ? '24px 1fr' : '24px 1fr 70px', alignItems: 'center', padding: `${t.rowY + 2}px 0`,
                  borderBottom: i === moves.length - 1 ? 0 : `1px solid ${t.HAIR}`,
                }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, fontWeight: 600 }}>{r.n}</span>
                  <div>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em' }}>{r.m}</div>
                    <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 2, letterSpacing: '0.06em' }}>{r.s}</div>
                  </div>
                  {!cardio && <div style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 12, color: t.INK, fontWeight: 700, letterSpacing: '-0.01em' }}>{r.l}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: `14px ${t.padX}px 4px` }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.5, letterSpacing: '-0.005em' }}>
            {event.sub ? `${event.sub} — ` : ''}open the Train tab for the full session card.
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
      {/* Macro card — squared instrument plate w/ event-accent spine */}
      <div style={{ padding: `16px ${t.padX}px 6px` }}>
        <div style={{ borderRadius: 6, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${event.accent || teal}`, background: t.PAPER2, padding: '14px 6px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {macros.map(([l, v], i) => (
            <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.HAIR}` : 0, paddingLeft: 10, paddingRight: 6 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 19, color: t.INK, marginTop: 4, letterSpacing: '-0.03em' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

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
          <div style={{ padding: `14px ${t.padX}px 6px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}><span style={{ color: teal }}>▍</span> On the plate</div>
          <div style={{ padding: `0 ${t.padX}px` }}>
            <div style={{ borderRadius: 6, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
              {plate.map((p, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', alignItems: 'center', padding: `${t.rowY + 2}px 0`, borderBottom: i === plate.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em', textTransform: 'capitalize' }}>{p}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <div style={{ height: 12 }} />
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
