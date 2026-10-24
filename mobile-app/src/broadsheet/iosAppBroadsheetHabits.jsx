import React from 'react';
import { createPortal } from 'react-dom';
import { hpWeek, hpMonth, hpStep, hpCanGoBack, hpCanGoForward, hpWindowStart, hpLocalYmd } from './habitProgress.mjs';
// ─── HABIT TRACKER ──────────────────────────────────────────
// A user-curated list of "Do daily" / "Don't do" items with optional
// reminder times. Renders on Client + Trainer + Nutritionist home.
//
// Persistence: tweaks.habits — JSON-encoded array of:
//   { id, name, type: 'do' | 'avoid', remindAt: 'HH:MM' | '',
//     history: ['YYYY-MM-DD', ...]  // dates this habit was completed
//   }
//
// Today's date is held internally as May 14 2026 to match the rest of the app.

const { useState: useStateBSH } = React;

// The i18n translator for this module. Mirrors client.jsx's useShapeTr —
// self-contained on the window globals (ShapeI18n/ShapeLocale), so this module
// doesn't depend on another file's copy or its load order.
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
// Active app locale for Intl date/number formatting.
function habitsLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}
// Localized weekday letters via Intl. dow = JS day-of-week (0=Sun … 6=Sat);
// 2023-01-01 was a Sunday, so Date.UTC(2023,0,1+dow) lands on that weekday.
function _bsDowNarrow(dow) {
  return new Date(Date.UTC(2023, 0, 1 + dow)).toLocaleDateString(habitsLocale(), { weekday: 'narrow', timeZone: 'UTC' });
}

function _bsHabitsToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// ── Date helpers (anchored at "today") ────────────────────
function _bsDateAdd(yyyymmdd, deltaDays) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const Y = dt.getUTCFullYear();
  const M = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const D = String(dt.getUTCDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
}
// Compute current streak: longest run of consecutive days ending at today
// or yesterday (so an unchecked-today habit doesn't lose its streak yet).
function _bsStreakFromHistory(history) {
  if (!history || history.length === 0) return 0;
  const set = new Set(history);
  let cursor = set.has(_bsHabitsToday())
    ? _bsHabitsToday()
    : (set.has(_bsDateAdd(_bsHabitsToday(), -1)) ? _bsDateAdd(_bsHabitsToday(), -1) : null);
  if (!cursor) return 0;
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = _bsDateAdd(cursor, -1);
  }
  return n;
}

// Sentence-case a habit name so it reads formally — "drink 3 glasses of water"
// → "Drink 3 glasses of water". Only acts when the first character is a lowercase
// a–z, so numbers ("10k steps"), symbols, and already-capitalized names are left
// untouched. Applied at the data-load boundary (decode + server map) so every
// surface — grid, To-do/To-don't rows, home tracker — reads consistently.
function _bsCapHabitName(name) {
  const s = String(name || '');
  const ch = s[0];
  return (ch >= 'a' && ch <= 'z') ? ch.toUpperCase() + s.slice(1) : s;
}

function _bsDecodeHabits(v) {
  if (!v || typeof v !== 'string') return [];
  try {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr)) return [];
    return arr.map((h, i) => {
      // Migrate from legacy { lastDone, streak, done } shape if present
      let history = Array.isArray(h.history)
        ? h.history.filter(d => typeof d === 'string')
        : [];
      if (history.length === 0 && h.lastDone && typeof h.lastDone === 'string') {
        history = [h.lastDone];
      }
      // Dedupe + sort ascending
      history = [...new Set(history)].sort();
      const visibility = ['private', 'friends', 'public'].includes(h.visibility)
        ? h.visibility
        : (h.public ? 'public' : 'private');
      return {
        id: h.id || `h${i}_${Date.now()}`,
        name: _bsCapHabitName(String(h.name || '').slice(0, 60)),
        type: h.type === 'avoid' ? 'avoid' : 'do',
        remindAt: typeof h.remindAt === 'string' ? h.remindAt : '',
        visibility,
        public: visibility === 'public',
        pts: 3,
        domain: h.domain === 'work' ? 'work' : undefined,
        history,
      };
    });
  } catch (e) { return []; }
}
function _bsEncodeHabits(arr) {
  return JSON.stringify(arr.map(h => ({
    id: h.id, name: h.name, type: h.type,
    remindAt: h.remindAt || '',
    visibility: ['private', 'friends', 'public'].includes(h.visibility) ? h.visibility : (h.public ? 'public' : 'private'),
    public: h.visibility === 'public' || !!h.public,
    pts: 3,
    domain: h.domain === 'work' ? 'work' : undefined,
    history: h.history || [],
  })));
}

const _BS_HABIT_DEMO_ROWS = [
  { id: 'demo_sleep', type: 'do', name: 'Sleep 7+ hours', pattern: [1, 1, 0, 1, 1, 1, 2], pts: 3 },
  { id: 'demo_steps', type: 'do', name: '10,000 steps', pattern: [1, 1, 1, 1, 0, 1, 2], pts: 3 },
  { id: 'demo_water', type: 'do', name: '3 L water', pattern: [1, 0, 1, 1, 1, 0, 0], pts: 3 },
  { id: 'demo_protein', type: 'do', name: 'Protein at every meal', pattern: [1, 1, 1, 0, 1, 1, 2], pts: 3 },
  { id: 'demo_mobility', type: 'do', name: '10 min mobility', pattern: [0, 1, 0, 1, 0, 1, 0], pts: 3 },
  { id: 'demo_vitamins', type: 'do', name: 'Take vitamins', pattern: [1, 1, 1, 1, 1, 0, 2], pts: 3 },
  { id: 'demo_sunlight', type: 'do', name: 'Morning sunlight', pattern: [1, 0, 1, 1, 0, 1, 0], pts: 3 },
  { id: 'demo_journal', type: 'do', name: '5 min journal', pattern: [0, 1, 1, 0, 1, 0, 0], pts: 3 },
  { id: 'demo_alcohol', type: 'avoid', name: 'No alcohol', pattern: [1, 1, 1, 1, 1, 1, 2], pts: 3 },
  { id: 'demo_screen', type: 'avoid', name: 'No screen after 10', pattern: [0, 1, 1, 0, 1, 1, 0], pts: 3 },
  { id: 'demo_soda', type: 'avoid', name: 'No soda or snacks', pattern: [1, 1, 1, 1, 1, 1, 2], pts: 3 },
  { id: 'demo_meals', type: 'avoid', name: 'No skipped meals', pattern: [1, 1, 0, 1, 1, 1, 2], pts: 3 },
  { id: 'demo_smoking', type: 'avoid', name: 'No smoking', pattern: [1, 1, 1, 1, 1, 1, 2], pts: 3 },
  { id: 'demo_sugar', type: 'avoid', name: 'No added sugar', pattern: [1, 0, 1, 1, 0, 1, 0], pts: 3 },
];

function _bsHabitPts(h) {
  // Every habit completion awards a flat +3 to the Shape Score ledger
  // (2026-06-18-score-ledger-lockdown.sql). The old per-habit 4–8 fallback was a
  // fabricated display value that didn't match the award — reconciled to +3.
  return 3;
}

const _BS_REM_DAYS = [['S', 0], ['M', 1], ['T', 2], ['W', 3], ['T', 4], ['F', 5], ['S', 6]];
function _bsBellIcon(filled, color) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}
// Per-habit reminder: opt-in time + days. Persists to habit_reminders (the cron
// reads it; the device schedules a local notification). Gentle by design.
function BSHabitReminderSheet({ habit, reminder, accent, onClose, onSaved }) {
  const t = useBS();
  const tr = useShapeTr();
  const r = reminder || {};
  const c = accent;
  const [on, setOn] = React.useState(!!reminder && r.enabled !== false);
  const [time, setTime] = React.useState(r.at_time || '09:00');
  const [days, setDays] = React.useState(Array.isArray(r.days) ? r.days.slice() : [1, 2, 3, 4, 5]);
  const toggleDay = (d) => setDays(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort((a, b) => a - b));
  const saving = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setPending(true);
    try {
      if (!on || !days.length) await window.ShapeHabitReminders?.remove?.(habit.id);
      else await window.ShapeHabitReminders?.set?.({ habitId: habit.id, label: habit.name, time, days, enabled: true });
    } catch (e) { window.__bsToast?.(tr('habits:reminder.saveError', { defaultValue: 'Could not save reminder' }), 'err'); return; }
    finally { saving.current = false; setPending(false); }
    onSaved && onSaved();
    onClose();
  };
  const chip = { flex: 1, padding: '7px 0', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' };
  const target = typeof document !== 'undefined' ? document.getElementById('bs-phone-surface') : null;
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '18px 18px 24px', borderTop: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: c }}>{tr('habits:reminder.title', { defaultValue: 'Habit reminder' })}</div>
        <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>{habit.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingBottom: 14, borderBottom: `1px solid ${t.HAIR}` }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK }}>{tr('habits:reminder.remindMe', { defaultValue: 'Remind me' })}</div>
          <button onClick={() => setOn(v => !v)} aria-pressed={on} style={{ width: 46, height: 27, borderRadius: 999, border: `1px solid ${on ? c : t.RULE}`, background: on ? c : 'transparent', position: 'relative', cursor: 'pointer' }}>
            <span style={{ position: 'absolute', top: 2, left: on ? 21 : 2, width: 21, height: 21, borderRadius: 999, background: on ? '#fff' : t.INK50 }} />
          </button>
        </div>
        {on && (
          <React.Fragment>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${t.HAIR}` }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK }}>{tr('habits:reminder.time', { defaultValue: 'Time' })}</div>
              <input aria-label={tr('habits:reminder.time', { defaultValue: 'Time' })} type="time" value={time} onChange={e => setTime(e.target.value)} style={{ background: 'transparent', color: c, border: `1px solid ${t.RULE}`, borderRadius: 999, padding: '6px 10px', fontFamily: t.MONO, fontSize: 12, fontWeight: 800, cursor: 'pointer' }} />
            </div>
            <div style={{ padding: '14px 0' }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, marginBottom: 10 }}>{tr('habits:reminder.days', { defaultValue: 'Days' })}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {_BS_REM_DAYS.map(([, d], i) => { const dn = days.includes(d); return (
                  <button key={i} aria-pressed={dn} aria-label={new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(2026, 0, 4 + d))} onClick={() => toggleDay(d)} style={{ flex: 1, minHeight: 44, borderRadius: 8, border: `1px solid ${dn ? c : t.RULE}`, background: dn ? `${c}22` : 'transparent', color: dn ? c : t.INK50, fontFamily: t.MONO, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{_bsDowNarrow(d)}</button>
                ); })}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => setDays([1, 2, 3, 4, 5])} style={chip}>{tr('habits:reminder.weekdays', { defaultValue: 'Weekdays' })}</button>
                <button onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} style={chip}>{tr('habits:reminder.everyDay', { defaultValue: 'Every day' })}</button>
              </div>
            </div>
          </React.Fragment>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', padding: '12px 18px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{tr('habits:common.cancel', { defaultValue: 'Cancel' })}</button>
          <button onClick={save} disabled={pending} style={{ flex: 1, padding: '12px', borderRadius: 999, background: c, color: '#04201d', border: 0, fontFamily: t.BODY, fontSize: 13.5, fontWeight: 760, cursor: 'pointer' }}>{on && days.length ? tr('habits:reminder.save', { defaultValue: 'Save reminder' }) : tr('habits:reminder.turnOff', { defaultValue: 'Turn off' })}</button>
        </div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>{tr('habits:reminder.footnote', { defaultValue: 'Off by default · skipped once you check it off · never nagging' })}</div>
      </div>
    </div>
  );
  return target ? createPortal(sheet, target) : sheet;
}
// Shared habits (owner, 2026-10-20): pick who hears, at 8 pm your time, that this habit is not
// checked off yet (/api/cron/habit-watch). The people are the ones joined to you by an accepted
// follow, either way round (habit_watch_candidates); saving goes through set_habit_watchers,
// which checks the habit and every person again. Picking no one makes the habit private.
function _bsPeopleIcon(color) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.4c1.9.8 3 2.8 3 5.6" />
    </svg>
  );
}
function BSHabitShareSheet({ habit, accent, current, onClose, onSaved }) {
  const t = useBS();
  const tr = useShapeTr();
  const c = accent;
  const [people, setPeople] = React.useState(null); // null = loading · { kind, people? }
  const [picked, setPicked] = React.useState(() => new Set(current || []));
  const [pending, setPending] = React.useState(false);
  const load = React.useCallback(() => {
    setPeople(null);
    const api = window.ShapeHabitWatch;
    if (!api?.candidates) { setPeople({ kind: 'error' }); return; }
    api.candidates().then(r => setPeople(r && r.kind ? r : { kind: 'error' })).catch(() => setPeople({ kind: 'error' }));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const toggle = (id) => setPicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const tooMany = picked.size > 20;
  const save = async () => {
    if (pending || tooMany) return;
    setPending(true);
    const r = await (window.ShapeHabitWatch?.set?.(habit.id, [...picked]) || Promise.resolve({ kind: 'error' })).catch(() => ({ kind: 'error' }));
    setPending(false);
    if (!r || r.kind !== 'ready') { window.__bsToast?.(tr('habits:share.saveFailed', { defaultValue: 'Could not save. Try again.' }), 'err'); return; }
    window.__bsToast?.(r.watchers.length
      ? tr('habits:share.savedOn', { defaultValue: '{count, plural, one {Shared with # person} other {Shared with # people}}', count: r.watchers.length })
      : tr('habits:share.savedOff', { defaultValue: 'Not shared' }), 'ok');
    onSaved && onSaved();
    onClose();
  };
  const note = (text, retry) => (
    <div style={{ padding: '18px 0', fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>
      {text}
      {retry && <button onClick={load} style={{ marginLeft: 10, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', color: c, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tr('habits:share.retry', { defaultValue: 'Retry' })}</button>}
    </div>
  );
  // People already picked who are no longer connected stay listed, so saving can drop them.
  const listed = people && people.kind === 'ready'
    ? [...people.people, ...[...picked].filter(id => !people.people.some(p => p.userId === id)).map(id => ({ userId: id, name: tr('habits:share.notConnected', { defaultValue: 'No longer connected' }) }))]
    : [];
  const target = typeof document !== 'undefined' ? document.getElementById('bs-phone-surface') : null;
  const body = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }}>
      <div role="dialog" aria-label={tr('habits:share.title', { defaultValue: 'Who hears if you miss it' })} onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '86%', display: 'flex', flexDirection: 'column', background: t.PAPER, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '18px 18px 24px', borderTop: `1px solid ${t.RULE}`, boxSizing: 'border-box' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: c }}>{tr('habits:share.title', { defaultValue: 'Who hears if you miss it' })}</div>
        <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>{habit.name}</div>
        <div style={{ marginTop: 8, fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{tr('habits:share.sub', { defaultValue: "At 8 pm your time, if it isn't checked off, the people you pick get a notification. They see the habit's name, nothing else." })}</div>
        <div className="bs-hide-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 10, borderTop: `1px solid ${t.HAIR}` }}>
          {people === null && note(tr('habits:page.loading', { defaultValue: 'Loading…' }))}
          {people && people.kind === 'error' && note(tr('habits:share.loadFailed', { defaultValue: "Couldn't load your people." }), true)}
          {people && people.kind === 'not_ready' && note(tr('habits:share.notReady', { defaultValue: "Sharing habits isn't switched on yet." }))}
          {people && people.kind === 'anon' && note(tr('habits:share.signIn', { defaultValue: 'Sign in to share a habit.' }))}
          {people && people.kind === 'ready' && listed.length === 0 && note(tr('habits:share.empty', { defaultValue: 'Follow someone, or accept a follower, to share a habit with them.' }))}
          {listed.map(p => { const on = picked.has(p.userId); return (
            <button key={p.userId} role="checkbox" aria-checked={on} onClick={() => toggle(p.userId)} style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52, padding: '0 2px', background: 'transparent', border: 0, borderBottom: `1px solid ${t.HAIR}`, cursor: 'pointer', textAlign: 'left', color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: on ? 700 : 500 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span aria-hidden style={{ flexShrink: 0, width: 22, height: 22, boxSizing: 'border-box', borderRadius: 4, border: `1.5px solid ${on ? c : t.RULE}`, background: on ? c : 'transparent', color: '#04201d', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900 }}>{on ? '✓' : ''}</span>
            </button>
          ); })}
        </div>
        {tooMany && <div role="alert" style={{ marginTop: 10, fontFamily: t.BODY, fontSize: 13, color: t.RUST || '#c0533b' }}>{tr('habits:share.max', { defaultValue: 'Pick 20 people or fewer.' })}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', minHeight: 44, padding: '12px 18px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{tr('habits:common.cancel', { defaultValue: 'Cancel' })}</button>
          <button onClick={save} disabled={pending || tooMany || !people || people.kind !== 'ready'} style={{ flex: 1, minHeight: 44, padding: '12px', borderRadius: 999, background: c, color: '#04201d', border: 0, fontFamily: t.BODY, fontSize: 13.5, fontWeight: 760, cursor: pending ? 'wait' : 'pointer', opacity: (pending || tooMany || !people || people.kind !== 'ready') ? 0.55 : 1 }}>{tr('habits:share.save', { defaultValue: 'Save' })}</button>
        </div>
      </div>
    </div>
  );
  return target ? createPortal(body, target) : body;
}
// What a habit's options say about its reminder: the time it rings, or nothing when it is off.
function _bsReminderTime(reminder) {
  if (!reminder || reminder.enabled === false || typeof reminder.at_time !== 'string') return '';
  const [h, m] = reminder.at_time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(habitsLocale(), { hour: 'numeric', minute: '2-digit' });
}

// A habit's options: its reminder, who hears if it is missed, and delete. Sharing shows only
// once the watchers have read, as the share button used to.
function BSHabitOptionsSheet({ habit, accent, reminder, watchers = null, onPick, onRemove, onClose }) {
  const t = useBS();
  const tr = useShapeTr();
  const c = accent;
  const time = _bsReminderTime(reminder);
  const shared = Array.isArray(watchers) ? watchers.length : 0;
  const item = { width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '0 2px', background: 'transparent', border: 0, borderBottom: `1px solid ${t.HAIR}`, cursor: 'pointer', textAlign: 'left', color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600 };
  const value = { marginLeft: 'auto', flexShrink: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK70 };
  const remove = async () => {
    if (await window.bsAskConfirm({ title: tr('habits:list.deleteTitle', { defaultValue: 'Delete this habit?' }), name: habit.name, message: tr('habits:list.deleteMessage', { defaultValue: 'This removes the habit from your daily list. Past check-offs are kept.' }), confirmLabel: tr('habits:list.deleteConfirm', { defaultValue: 'Delete habit' }) })) {
      onClose();
      onRemove(habit.id);
    }
  };
  const target = typeof document !== 'undefined' ? document.getElementById('bs-phone-surface') : null;
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }}>
      <div role="dialog" aria-label={tr('habits:options.title', { defaultValue: 'Habit options' })} onClick={e => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '18px 18px 24px', borderTop: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: c }}>{tr('habits:options.title', { defaultValue: 'Habit options' })}</div>
        <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>{habit.name}</div>
        <div style={{ marginTop: 10, borderTop: `1px solid ${t.HAIR}` }}>
          <button onClick={() => onPick('reminder')} style={item}>
            {_bsBellIcon(!!time, time ? c : t.INK70)}
            <span>{tr('habits:reminder.title', { defaultValue: 'Habit reminder' })}</span>
            <span style={value}>{time || tr('habits:options.off', { defaultValue: 'Off' })}</span>
          </button>
          {Array.isArray(watchers) && (
            <button onClick={() => onPick('share')} style={item}>
              {_bsPeopleIcon(shared ? c : t.INK70)}
              <span>{tr('habits:share.title', { defaultValue: 'Who hears if you miss it' })}</span>
              <span style={value}>{shared ? tr('habits:share.ariaShared', { defaultValue: '{count, plural, one {Shared with # person} other {Shared with # people}}', count: shared }) : tr('habits:share.savedOff', { defaultValue: 'Not shared' })}</span>
            </button>
          )}
          <button onClick={remove} style={{ ...item, color: t.RUST }}>
            <span aria-hidden style={{ width: 15, textAlign: 'center', fontSize: 17, lineHeight: 1 }}>×</span>
            <span>{tr('habits:list.deleteConfirm', { defaultValue: 'Delete habit' })}</span>
          </button>
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: 16, minHeight: 44, padding: '12px 18px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{tr('habits:common.cancel', { defaultValue: 'Cancel' })}</button>
      </div>
    </div>
  );
  return target ? createPortal(sheet, target) : sheet;
}

// One habit as one big button (owner, 2026-10-24, look C): tap anywhere on it to tick it, and a
// kept habit fills solid with its colour. ⋯ beside it opens the options (reminder, sharing,
// delete), so the row carries one action and one way to the rest.
function BSHabitRow({ habit, accent, onToggle, onRemove, reminder, onReminderChange, watchers = null, onShareChange = null }) {
  const t = useBS();
  const tr = useShapeTr();
  const done = (habit.history || []).includes(_bsHabitsToday());
  const isAvoid = habit.type === 'avoid';
  const c = accent;
  const onC = isAvoid ? '#2b0d07' : '#04201d';
  const ink = done ? onC : t.INK;
  const soft = done ? onC : t.INK70;
  const [sheet, setSheet] = React.useState(null); // 'options' | 'reminder' | 'share'
  const run = _bsStreakFromHistory(habit.history || []);
  const time = _bsReminderTime(reminder);
  const shared = Array.isArray(watchers) ? watchers.length : 0;
  const runText = run === 0
    ? tr('habits:row.noRun', { defaultValue: 'No run yet' })
    : isAvoid
      ? tr('habits:row.clean', { defaultValue: '{count, plural, one {# day clean} other {# days clean}}', count: run })
      : tr('habits:row.run', { defaultValue: '{count, plural, one {#-day run} other {#-day run}}', count: run });
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 68, borderRadius: 12, boxSizing: 'border-box', border: `1.5px solid ${done ? c : `${c}8c`}`, background: done ? c : 'transparent', transition: 'background 180ms ease, border-color 180ms ease' }}>
      <button onClick={() => onToggle(habit.id)} aria-pressed={done} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 4px 10px 12px', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left', color: ink }}>
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box', display: 'grid', placeItems: 'center', background: done ? 'rgba(0,0,0,0.14)' : 'transparent', border: done ? 0 : `2px solid ${c}` }}>
          {done && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={onC} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2, color: ink }}>{habit.name}</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px', marginTop: 4, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: soft }}>
            {habit.domain === 'work' && <span style={{ color: done ? onC : t.BLUE }}>{tr('habits:row.workTag', { defaultValue: 'Work · ' })}</span>}
            <span style={{ color: done ? onC : isAvoid ? t.RUST : soft }}>{done ? `${isAvoid ? tr('habits:row.stayedClean', { defaultValue: '✓ Stayed clean' }) : tr('habits:row.kept', { defaultValue: '✓ Kept' })} · ` : ''}{runText}</span>
            {!done && time && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{_bsBellIcon(true, c)}{time}</span>}
            {!done && shared > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{_bsPeopleIcon(soft)}{shared}</span>}
          </span>
        </span>
        <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 800, color: soft }}>+{_bsHabitPts(habit)}</span>
      </button>
      <button onClick={() => setSheet('options')} aria-label={tr('habits:row.options', { defaultValue: 'Options for {name}', name: habit.name })} style={{ width: 44, flexShrink: 0, background: 'transparent', border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={soft} aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
      </button>
      {sheet === 'options' && <BSHabitOptionsSheet habit={habit} accent={c} reminder={reminder} watchers={watchers} onPick={setSheet} onRemove={onRemove} onClose={() => setSheet(null)} />}
      {sheet === 'reminder' && <BSHabitReminderSheet habit={habit} reminder={reminder} accent={c} onClose={() => setSheet(null)} onSaved={onReminderChange} />}
      {sheet === 'share' && <BSHabitShareSheet habit={habit} accent={c} current={watchers} onClose={() => setSheet(null)} onSaved={onShareChange} />}
    </div>
  );
}

// Today: the points banked against the points on offer, then every habit as a button.
function BSHabitToday({ habits, onToggle, onRemove, onAdd, reminders, onReminderChange, watch = null, onShareChange = null }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const today = _bsHabitsToday();
  const ordered = [...habits.filter(h => h.type !== 'avoid'), ...habits.filter(h => h.type === 'avoid')];
  const doneCount = habits.filter(h => (h.history || []).includes(today)).length;
  const earned = habits.filter(h => (h.history || []).includes(today)).reduce((s, h) => s + _bsHabitPts(h), 0);
  const possible = habits.reduce((s, h) => s + _bsHabitPts(h), 0);
  const left = habits.length - doneCount;
  const addBtn = (type) => (
    <button onClick={() => onAdd(type)} style={{ flex: 1, minHeight: 48, borderRadius: 10, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600 }}>
      <span style={{ color: type === 'avoid' ? t.RUST : teal, marginRight: 4 }}>＋</span>{type === 'avoid' ? tr('habits:today.addToDont', { defaultValue: 'Add a to-don’t' }) : tr('habits:today.addToDo', { defaultValue: 'Add a to-do' })}
    </button>
  );
  return (
    <div style={{ padding: `6px ${t.padX}px 0` }}>
      {habits.length === 0 ? (
        <div style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.3, color: t.INK }}>
          {tr('habits:score.emptyLead', { defaultValue: 'Add a habit —' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('habits:score.emptyEmph', { defaultValue: 'daily points live here.' })}</span>
        </div>
      ) : (
        <React.Fragment>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontFamily: t.DISPLAY, color: t.INK }}>
              <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>+{earned}</span>{' '}
              <span style={{ fontSize: 17, fontWeight: 500, color: t.INK70 }}>{tr('habits:today.ofPossible', { defaultValue: '{possible, plural, one {of # pt today} other {of # pts today}}', possible })}</span>
            </div>
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: left ? t.INK : teal }}>
              {left ? tr('habits:today.toGo', { defaultValue: '{count} to go', count: left }) : tr('habits:today.allDone', { defaultValue: '✓ All done' })}
            </span>
          </div>
          <div role="progressbar" aria-label={tr('habits:today.progress', { defaultValue: 'Habits done today' })} aria-valuemin={0} aria-valuemax={habits.length} aria-valuenow={doneCount} style={{ height: 10, borderRadius: 5, background: t.HAIR, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${habits.length ? (doneCount / habits.length) * 100 : 0}%`, borderRadius: 5, background: teal, transition: 'width 240ms ease' }} />
          </div>
          <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70 }}>{tr('habits:today.hint', { defaultValue: 'Tap a habit to tick it' })}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {ordered.map(h => (
              <BSHabitRow key={h.id} habit={h} accent={h.type === 'avoid' ? t.RUST : teal} onToggle={onToggle} onRemove={onRemove} reminder={reminders && reminders[h.id]} onReminderChange={onReminderChange} watchers={watch ? (watch[h.id] || []) : null} onShareChange={onShareChange} />
            ))}
          </div>
        </React.Fragment>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>{addBtn('do')}{addBtn('avoid')}</div>
    </div>
  );
}

// ─── PROGRESS: THE WEEK AND THE MONTH ───────────────────────────────────────────────────────────
// Owner, 2026-10-24: "members to be able to see weekly chart and also monthly for habits". Week:
// a column a day, one segment per habit kept (to-dos teal, to-don'ts rust, today's open ones
// dashed) against last week's daily average. Month: a calendar shaded by the share kept. Tapping a
// day says which habits it held. The numbers come from habitProgress.mjs.
const _bsYmdDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
function _bsFmtDay(ymd, opts) { return _bsYmdDate(ymd).toLocaleDateString(habitsLocale(), opts); }
function _bsFmtWeek(start, end) {
  const f = new Intl.DateTimeFormat(habitsLocale(), { day: 'numeric', month: 'short' });
  try { return f.formatRange(_bsYmdDate(start), _bsYmdDate(end)); } catch (e) { return `${f.format(_bsYmdDate(start))} – ${f.format(_bsYmdDate(end))}`; }
}

function BSHabitDayDetail({ col }) {
  const t = useBS();
  const tr = useShapeTr();
  if (!col) return <div style={{ marginTop: 10, minHeight: 34, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>{tr('habits:progress.tapDay', { defaultValue: 'Tap a day to see it' })}</div>;
  const date = _bsFmtDay(col.day, { weekday: 'short', day: 'numeric', month: 'short' });
  const line = col.future
    ? tr('habits:progress.dayAhead', { defaultValue: '{date}: still ahead', date })
    : col.active === 0
      ? tr('habits:progress.dayNone', { defaultValue: '{date}: no habits yet', date })
      : tr('habits:progress.dayKept', { defaultValue: '{date}: {kept} of {active} kept', date, kept: col.kept.length, active: col.active });
  return (
    <div aria-live="polite" style={{ marginTop: 10, minHeight: 34 }}>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK }}>{line}</div>
      {col.active > 0 && !col.future && (
        <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontFamily: t.BODY, fontSize: 12.5, lineHeight: 1.45, color: t.INK70 }}>
          {[...col.kept.map(h => [h, '✓']), ...col.open.map(h => [h, '○']), ...col.missed.map(h => [h, '×'])].map(([h, mark]) => <span key={h.id} style={{ whiteSpace: 'nowrap' }}>{mark} {h.name}</span>)}
        </div>
      )}
    </div>
  );
}

function BSHabitWeekChart({ week, selected, onSelect }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const H = 132;
  const unit = H / week.scale;
  const ticks = week.scale <= 5 ? Array.from({ length: week.scale }, (_, i) => i + 1) : [Math.round(week.scale / 2), week.scale];
  const avg = week.prev ? week.prev.avgPerDay : null;
  const col = (h) => (h.type === 'avoid' ? t.RUST : teal);
  return (
    <div style={{ position: 'relative', margin: '26px 0 0 18px' }}>
      {ticks.map(n => (
        <React.Fragment key={n}>
          <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 20 + n * unit, borderTop: `1px solid ${t.HAIR}` }} />
          <span aria-hidden style={{ position: 'absolute', left: -18, bottom: 20 + n * unit - 6, fontFamily: t.MONO, fontSize: 9, color: t.INK70 }}>{n}</span>
        </React.Fragment>
      ))}
      {avg != null && <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 20 + avg * unit, borderTop: `1.5px dashed ${t.INK70}` }} />}
      <div role="group" aria-label={tr('habits:progress.chartAria', { defaultValue: 'Habits kept each day' })} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {week.days.map(d => {
          const segs = [...d.kept.map(h => ({ h, open: false })), ...(d.isToday ? d.open.map(h => ({ h, open: true })) : [])];
          const on = selected === d.day;
          const label = d.future
            ? tr('habits:progress.dayAhead', { defaultValue: '{date}: still ahead', date: _bsFmtDay(d.day, { weekday: 'long', day: 'numeric', month: 'long' }) })
            : tr('habits:progress.dayKept', { defaultValue: '{date}: {kept} of {active} kept', date: _bsFmtDay(d.day, { weekday: 'long', day: 'numeric', month: 'long' }), kept: d.kept.length, active: d.active });
          return (
            <button key={d.day} onClick={() => onSelect(on ? null : d.day)} aria-pressed={on} aria-label={label} style={{ position: 'relative', height: H + 20, padding: 0, border: 0, background: on ? `${teal}14` : 'transparent', borderRadius: 6, cursor: 'pointer' }}>
              <span aria-hidden style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 26, bottom: 20, height: H }}>
                {segs.map(({ h, open }, j) => (
                  <span key={h.id} style={{ position: 'absolute', left: 0, right: 0, bottom: j * unit, height: Math.max(2, unit - 2), boxSizing: 'border-box', background: open ? 'transparent' : col(h), border: open ? `1.5px dashed ${col(h)}` : 0, borderRadius: j === segs.length - 1 ? '4px 4px 0 0' : 0 }} />
                ))}
              </span>
              {!d.future && d.active > 0 && (
                <span aria-hidden style={{ position: 'absolute', left: -6, right: -6, bottom: 20 + segs.length * unit + 5, textAlign: 'center', whiteSpace: 'nowrap', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, color: d.isToday ? teal : t.INK }}>
                  {d.isToday && d.open.length ? tr('habits:progress.soFar', { defaultValue: '{count} so far', count: d.kept.length }) : d.kept.length}
                </span>
              )}
              <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 20, borderTop: `1.5px solid ${t.INK}`, paddingTop: 5, boxSizing: 'border-box', textAlign: 'center', fontFamily: t.MONO, fontSize: 9, fontWeight: d.isToday || on ? 800 : 700, color: d.isToday ? teal : t.INK70 }}>{_bsFmtDay(d.day, { weekday: 'short' })}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BSHabitCalendar({ month, firstDay, selected, onSelect }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const shade = [t.PAPER2, `${teal}38`, `${teal}8c`, teal];
  const heads = Array.from({ length: 7 }, (_, i) => _bsDowNarrow((firstDay + i) % 7));
  return (
    <div>
      <div role="group" aria-label={tr('habits:progress.calendarAria', { defaultValue: 'Habits kept each day this month' })} style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {heads.map((d, i) => <span key={`h${i}`} aria-hidden style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK70, paddingBottom: 2 }}>{d}</span>)}
        {Array.from({ length: month.lead }, (_, i) => <span key={`b${i}`} aria-hidden />)}
        {month.cells.map(c => {
          const on = selected === c.day;
          const date = _bsFmtDay(c.day, { weekday: 'long', day: 'numeric', month: 'long' });
          const label = c.future ? tr('habits:progress.dayAhead', { defaultValue: '{date}: still ahead', date })
            : c.level == null ? tr('habits:progress.dayNone', { defaultValue: '{date}: no habits yet', date })
              : tr('habits:progress.dayKept', { defaultValue: '{date}: {kept} of {active} kept', date, kept: c.kept.length, active: c.active });
          const fill = c.future || c.level == null ? 'transparent' : shade[c.level];
          return (
            <button key={c.day} onClick={() => onSelect(on ? null : c.day)} aria-pressed={on} aria-label={label} style={{
              height: 42, padding: '4px 0 0 5px', borderRadius: 5, textAlign: 'left', verticalAlign: 'top', cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 10, fontWeight: 700, background: fill,
              color: c.future || c.level == null ? t.INK70 : c.level === 3 ? '#04201d' : t.INK,
              border: c.future || c.level == null ? `1px dashed ${t.RULE}` : c.level === 0 ? `1px solid ${t.RULE}` : 0,
              outline: c.isToday || on ? `2px solid ${on ? teal : t.INK}` : 'none', outlineOffset: 1,
            }}>{c.date}</button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px', marginTop: 10, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK70 }}>
        <span>{tr('habits:progress.legendKept', { defaultValue: 'Habits kept' })}</span>
        {[tr('habits:progress.levelNone', { defaultValue: 'None' }), tr('habits:progress.levelSome', { defaultValue: 'Some' }), tr('habits:progress.levelMost', { defaultValue: 'Most' }), tr('habits:progress.levelAll', { defaultValue: 'All' })].map((label, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <i aria-hidden style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: shade[i], boxShadow: i === 0 ? `inset 0 0 0 1px ${t.RULE}` : 'none' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BSHabitProgress({ habits }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const today = _bsHabitsToday();
  const windowStart = hpWindowStart(today);
  // Monday to Sunday, as the app's week strip and Home's Week so far run.
  const firstDay = 1;
  // A habit kept on this device alone (signed out) has no day it was made: it counts from its
  // first tick, so the days before it existed are not misses.
  const known = React.useMemo(() => habits.map(h => (h.createdOn ? h : { ...h, createdOn: (h.history && h.history[0]) || today })), [habits, today]);
  const [mode, setMode] = React.useState('week');
  const [anchor, setAnchor] = React.useState(today);
  const [selected, setSelected] = React.useState(null);
  const opts = { anchor, today, firstDay, windowStart };
  const week = mode === 'week' ? hpWeek(known, opts) : null;
  const month = mode === 'month' ? hpMonth(known, opts) : null;
  const view = week || month;
  const pick = (m) => { setMode(m); setAnchor(today); setSelected(null); };
  const step = (n) => { setAnchor(a => hpStep(mode, a, n, firstDay)); setSelected(null); };
  const canBack = hpCanGoBack(mode, anchor, { firstDay, windowStart });
  const canFwd = hpCanGoForward(mode, anchor, { firstDay, today });
  const cells = week ? week.days : month.cells;
  const picked = selected ? cells.find(c => c.day === selected) : null;
  const eyebrow = { fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70 };
  const navBtn = (dir, enabled, label) => (
    <button onClick={() => enabled && step(dir)} disabled={!enabled} aria-label={label} style={{ width: 44, height: 44, border: 0, background: 'transparent', padding: 0, display: 'grid', placeItems: 'center', cursor: enabled ? 'pointer' : 'default', color: t.INK, opacity: enabled ? 1 : 0.3 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>
    </button>
  );
  const segBtn = (m, label) => (
    <button onClick={() => pick(m)} aria-pressed={mode === m} style={{ minHeight: 38, border: 0, borderRadius: 6, cursor: 'pointer', background: mode === m ? t.INK : 'transparent', color: mode === m ? t.PAPER : t.INK70, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{label}</button>
  );
  const fmtAvg = (n) => new Intl.NumberFormat(habitsLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n);
  let compare = null;
  if (week && week.prev && week.pct != null) {
    const d = week.pct - week.prev.pct;
    compare = d > 0 ? tr('habits:progress.up', { defaultValue: '▲ Up from {pct}% last week', pct: week.prev.pct })
      : d < 0 ? tr('habits:progress.down', { defaultValue: '▼ Down from {pct}% last week', pct: week.prev.pct })
        : tr('habits:progress.same', { defaultValue: 'Same as last week' });
  }
  const best = month && month.bestRun;
  const byHabit = (week ? week.perHabit : month.perHabit);
  return (
    <section aria-label={tr('habits:progress.eyebrow', { defaultValue: 'Progress' })} style={{ padding: `26px ${t.padX}px 0` }}>
      <div aria-hidden style={{ height: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
        <div>
          <div style={{ ...eyebrow, color: teal }}>{tr('habits:progress.eyebrow', { defaultValue: 'Progress' })}</div>
          <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK }}>
            {week ? tr('habits:progress.yourWeek', { defaultValue: 'Your week' }) : tr('habits:progress.yourMonth', { defaultValue: 'Your month' })}<span style={{ color: teal }}>.</span>
          </div>
        </div>
        <div role="group" aria-label={tr('habits:progress.period', { defaultValue: 'Chart period' })} style={{ width: 150, flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 3, border: `1px solid ${t.RULE}`, borderRadius: 9, background: t.PAPER2 }}>
          {segBtn('week', tr('habits:progress.week', { defaultValue: 'Week' }))}
          {segBtn('month', tr('habits:progress.month', { defaultValue: 'Month' }))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        {navBtn(-1, canBack, week ? tr('habits:progress.prevWeek', { defaultValue: 'Previous week' }) : tr('habits:progress.prevMonth', { defaultValue: 'Previous month' }))}
        <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{week ? _bsFmtWeek(week.start, week.end) : _bsFmtDay(month.start, { month: 'long', year: 'numeric' })}</span>
        {navBtn(1, canFwd, week ? tr('habits:progress.nextWeek', { defaultValue: 'Next week' }) : tr('habits:progress.nextMonth', { defaultValue: 'Next month' }))}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', color: t.INK }}>{view.pct == null ? '—' : `${view.pct}%`}</span>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, color: t.INK70 }}>
          {view.pct == null ? tr('habits:progress.nothing', { defaultValue: 'No habits to count yet' })
            : view.isCurrent ? tr('habits:progress.keptSoFar', { defaultValue: '{kept} of {slots} kept so far', kept: view.kept, slots: view.slots })
              : tr('habits:progress.kept', { defaultValue: '{kept} of {slots} kept', kept: view.kept, slots: view.slots })}
        </span>
      </div>
      {compare && <div style={{ ...eyebrow, marginTop: 6, fontSize: 9.5, letterSpacing: '0.08em', color: week.pct >= week.prev.pct ? teal : t.INK70 }}>{compare}</div>}
      {best && <div style={{ ...eyebrow, marginTop: 6, fontSize: 9.5, letterSpacing: '0.08em' }}>{best.habit.type === 'avoid'
        ? tr('habits:progress.bestClean', { defaultValue: 'Best run · {name}, {count, plural, one {# day clean} other {# days clean}}', name: best.habit.name, count: best.days })
        : tr('habits:progress.bestRun', { defaultValue: 'Best run · {name}, {count, plural, one {# day} other {# days}}', name: best.habit.name, count: best.days })}</div>}
      {week && (
        <React.Fragment>
          <BSHabitWeekChart week={week} selected={selected} onSelect={setSelected} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK70 }}>
            <span><i aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: -1, background: teal }} />{tr('habits:progress.legendDo', { defaultValue: 'To do' })}</span>
            <span><i aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: -1, background: t.RUST }} />{tr('habits:progress.legendDont', { defaultValue: 'To don’t' })}</span>
            {week.isCurrent && <span><i aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: -1, boxSizing: 'border-box', border: `1.5px dashed ${teal}` }} />{tr('habits:progress.legendOpen', { defaultValue: 'Open today' })}</span>}
            {week.prev && <span><i aria-hidden style={{ display: 'inline-block', width: 12, marginRight: 5, verticalAlign: 3, borderTop: `1.5px dashed ${t.INK70}` }} />{tr('habits:progress.legendAvg', { defaultValue: 'Last week avg {avg}/day', avg: fmtAvg(week.prev.avgPerDay) })}</span>}
          </div>
        </React.Fragment>
      )}
      {month && <BSHabitCalendar month={month} firstDay={firstDay} selected={selected} onSelect={setSelected} />}
      <BSHabitDayDetail col={picked} />
      <div style={{ ...eyebrow, marginTop: 14 }}>{tr('habits:progress.byHabit', { defaultValue: 'By habit' })}</div>
      <div style={{ marginTop: 4 }}>
        {byHabit.map(r => {
          const c = r.habit.type === 'avoid' ? t.RUST : teal;
          return week ? (
            <div key={r.habit.id} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 36px', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.habit.name}</span>
              <span aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
                {r.cells.map((s, i) => <span key={i} style={{ height: 14, borderRadius: 3, boxSizing: 'border-box', background: s === 'kept' ? c : 'transparent', border: s === 'open' ? `1.5px dashed ${c}` : s === 'missed' ? `1px solid ${t.RULE}` : s === 'kept' ? 0 : `1px dashed ${t.HAIR}` }} />)}
              </span>
              <span style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, color: t.INK }}>{r.of ? `${r.kept}/${r.of}` : '—'}</span>
            </div>
          ) : (
            <div key={r.habit.id} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 78px', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.habit.name}</span>
              <span aria-hidden style={{ position: 'relative', display: 'block', height: 8, borderRadius: 4, background: t.HAIR }}><span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${r.pct || 0}%`, borderRadius: 4, background: c }} /></span>
              <span style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, color: t.INK }}>{r.pct == null ? '—' : `${r.pct}%`} <span style={{ fontWeight: 700, color: t.INK70 }}>{r.of ? `${r.kept}/${r.of}` : ''}</span></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const _BS_HABIT_SUGGEST = {
  do: ['Cold shower', 'Read 10 pages', 'Stretch', 'Meditate 5 min', 'Water 3L', 'Take vitamins', '10k steps', 'Morning sunlight', 'Sleep by 10:30', '5 min journal'],
  avoid: ['No soda', 'No snooze', 'No skipping breakfast', 'No takeout', 'No screens 1h pre-bed', 'No smoking', 'No added sugar', 'No alcohol weekdays', 'No phone in bed'],
  // The work domain (spec 2026-07-13) — picking one of these STAMPS the habit
  // domain:'work' (never inferred from the name).
  workDo: ['Deep work block', 'Read 20 min', 'Plan tomorrow’s top 3', 'Applied to one job', 'Inbox zero by 5'],
  workAvoid: ['No doom-scrolling at the desk', 'No email after 8pm', 'No phone the first hour'],
};

// Bottom-sheet add flow — do / avoid variant, suggestion chips, points stepper.
function BSHabitAddSheet({ type, accent, onClose, onCreate }) {
  const t = useBS();
  const tr = useShapeTr();
  const isAvoid = type === 'avoid';
  const onAccentInk = isAvoid ? '#2b0d07' : '#04201d';
  const [name, setName] = useStateBSH('');
  const pts = 3;
  const saving = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  // domain:'work' — set by the work chips or the WORK toggle; a plain chip or
  // hand-typed habit stays domain-less (honest-absent, never name-inferred).
  const [domain, setDomain] = useStateBSH('');
  const inputRef = React.useRef(null);
  React.useEffect(() => { const id = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(id); }, []);
  const suggestions = _BS_HABIT_SUGGEST[isAvoid ? 'avoid' : 'do'];
  const workSuggestions = _BS_HABIT_SUGGEST[isAvoid ? 'workAvoid' : 'workDo'];
  const canAdd = name.trim().length > 0;
  const add = async () => { if (!canAdd || saving.current) return; saving.current = true; setPending(true); try { await onCreate({ name: name.trim(), type: isAvoid ? 'avoid' : 'do', pts, domain: domain || undefined }); } finally { saving.current = false; setPending(false); } };
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `10px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: t.RULE, margin: '0 auto 14px' }} />
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent }}>{isAvoid ? tr('habits:add.newToDont', { defaultValue: 'New to-don’t' }) : tr('habits:add.newToDo', { defaultValue: 'New to-do' })}</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>{tr('habits:add.somethingTo', { defaultValue: 'Something to' })} <span style={{ fontStyle: 'italic', color: accent }}>{isAvoid ? tr('habits:add.emphAvoid', { defaultValue: 'avoid.' }) : tr('habits:add.emphDo', { defaultValue: 'do.' })}</span></div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          maxLength={60}
          placeholder={isAvoid ? tr('habits:add.placeholderAvoid', { defaultValue: 'e.g. No second coffee' }) : tr('habits:add.placeholderDo', { defaultValue: 'e.g. 10 min walk after lunch' })}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 16, padding: '8px 0', background: 'transparent', color: t.INK, border: 0, borderBottom: `1px solid ${t.RULE}`, outline: 'none', fontFamily: t.DISPLAY, fontSize: 18 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => { setName(s); setDomain(''); }} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>{s}</button>
          ))}
        </div>
        {/* WORK — the work-domain chips (t.BLUE); picking one stamps domain:'work'.
            The toggle covers hand-typed work habits. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <span aria-hidden style={{ flexShrink: 0, width: 10, height: 3, background: t.BLUE }} />
          <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{tr('habits:add.work', { defaultValue: 'Work' })}</span>
          <span aria-hidden style={{ flex: 1 }} />
          <button onClick={() => setDomain(d => d === 'work' ? '' : 'work')} aria-pressed={domain === 'work'} style={{ background: 'transparent', border: `1px solid ${domain === 'work' ? t.BLUE : t.RULE}`, borderRadius: 999, padding: '6px 11px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: domain === 'work' ? t.BLUE : t.INK50 }}>{domain === 'work' ? tr('habits:add.workHabitOn', { defaultValue: '✓ Work habit' }) : tr('habits:add.workHabit', { defaultValue: 'Work habit' })}</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
          {workSuggestions.map(s => (
            <button key={s} onClick={() => { setName(s); setDomain('work'); }} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${t.BLUE}55`, background: `${t.BLUE}14`, color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>{s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{tr('habits:add.points', { defaultValue: 'Points' })}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: accent, letterSpacing: '-0.03em', minWidth: 44, textAlign: 'center' }}>+{pts}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', padding: '14px 22px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('habits:common.cancel', { defaultValue: 'Cancel' })}</button>
          <button onClick={add} disabled={!canAdd || pending} style={{ flex: 1, padding: '14px', borderRadius: 999, border: 0, background: canAdd ? accent : t.RULE, color: canAdd ? onAccentInk : t.INK50, cursor: canAdd ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('habits:add.addHabit', { defaultValue: 'Add habit' })}</button>
        </div>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

function _bsMapServerHabits(rows) {
  return (rows || []).map(h => ({
    id: h.id,
    name: _bsCapHabitName(h.name),
    type: h.type === 'avoid' ? 'avoid' : 'do',
    cadence: h.cadence || 'daily',
    visibility: ['private', 'friends', 'public'].includes(h.visibility) ? h.visibility : 'private',
    public: h.visibility === 'public',
    pts: 3,
    domain: h.domain === 'work' ? 'work' : undefined,
    // The local day the habit was made: the Progress card counts nothing before it.
    createdOn: h.created_at && Number.isFinite(Date.parse(h.created_at)) ? hpLocalYmd(new Date(h.created_at)) : undefined,
    history: Array.isArray(h.history) ? h.history : [],
  }));
}

// ── Shared habits state + actions ────────────────────────────
// When signed in, habits are live in Supabase via /api/client/habits (the
// app's bridged session authenticates the same-origin request). Signed out,
// fall back to the in-memory tweaks store (ephemeral demo behaviour). Used by
// BOTH the home tracker and the dedicated habits page so a completion toggled
// in one place persists everywhere. Server mutations update optimistically and
// also mirror into tweaks so the home summary reflects them without a refetch.
function _bsUseServerHabits(tweaks, setTweak) {
  const tr = useShapeTr();
  const uid = window.ShapeAuth?.getCachedState?.().user?.id || null;
  const [snapshot, setSnapshot] = React.useState({ uid: null, habits: [], status: 'loading' });
  const [revision, refresh] = React.useReducer(n => n + 1, 0);
  const busy = React.useRef(false);
  const current = React.useRef(snapshot); current.current = snapshot;
  const liveUid = () => window.ShapeAuth?.getCachedState?.().user?.id || null;
  React.useEffect(() => {
    let alive = true;
    if (!uid) return;
    setSnapshot({ uid, habits: [], status: 'loading' });
    window.ShapeHabitsData.listStrict().then(d => {
      if (!alive || liveUid() !== uid) return;
      const habits = _bsMapServerHabits(d.habits);
      setSnapshot({ uid, habits, status: 'ready' });
      setTweak('habits', _bsEncodeHabits(habits));
    }).catch(() => { if (alive && liveUid() === uid) setSnapshot({ uid, habits: [], status: 'error' }); });
    return () => { alive = false; };
  }, [uid, revision]);
  // Refresh at the local midnight boundary, including after a suspended tab wakes.
  React.useEffect(() => {
    let day = _bsHabitsToday();
    const tick = () => { const next = _bsHabitsToday(); if (next !== day) { day = next; refresh(); } };
    const timer = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  const local = _bsDecodeHabits(tweaks.habits);
  const status = uid ? (snapshot.uid === uid ? snapshot.status : 'loading') : 'ready';
  const habits = uid ? (snapshot.uid === uid ? snapshot.habits : []) : local;
  const mutate = async (body, apply) => {
    if (busy.current || (uid && status !== 'ready')) return false;
    busy.current = true;
    try {
      const data = uid ? await window.ShapeHabitsData.action(body) : {};
      if (liveUid() !== uid) return false;
      const next = apply(uid ? current.current.habits : local, data);
      if (uid) { const value = { uid, habits: next, status: 'ready' }; current.current = value; setSnapshot(value); }
      setTweak('habits', _bsEncodeHabits(next));
      return true;
    } catch (e) {
      if (liveUid() === uid) window.__bsToast?.(tr('habits:toast.updateError', { defaultValue: 'Could not update habit' }), 'err');
      return false;
    } finally { busy.current = false; }
  };
  const create = ({ name, type = 'do', cadence = 'daily', visibility = 'private', domain }) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) return Promise.resolve(false);
    const body = { action: 'create', name: cleanName, type, cadence, visibility, domain };
    return mutate(body, (list, data) => [...list, ..._bsMapServerHabits([{ ...(data.habit || { ...body, id: 'h_' + Math.random().toString(36).slice(2, 9) }), history: [] }])]);
  };
  const remove = async id => {
    const saved = await mutate({ action: 'delete', id }, list => list.filter(h => h.id !== id));
    if (saved) {
      window.__bsToast?.(tr('habits:toast.removed', { defaultValue: 'Habit removed' }), 'ok');
      // An archived habit must not keep nudging this device.
      window.ShapeHabitReminders?.remove?.(id).catch(() => {});
    }
    return saved;
  };
  const setVisibility = (id, visibility) => mutate({ action: 'update', id, visibility }, list => list.map(h => h.id === id ? { ...h, visibility, public: visibility === 'public' } : h));
  const toggle = id => {
    if (window.bsRequireAccount && !window.bsRequireAccount(tr('habits:gate.trackHabits', { defaultValue: 'track habits' }))) return;
    const date = _bsHabitsToday();
    const done = !(habits.find(h => h.id === id)?.history || []).includes(date);
    return mutate({ action: 'set', id, date, done }, (list, data) => list.map(h => {
      if (h.id !== id) return h;
      const history = new Set(h.history || []);
      if (data.done ?? done) history.add(date); else history.delete(date);
      return { ...h, history: [...history].sort() };
    }));
  };
  return { loggedIn: !!uid, useServer: !!uid, habits, status, retry: refresh, create, remove, setVisibility, toggle };
}

function BSHabitsPage({ onBack, onOpenScore, tweaks, setTweak, accent }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const { BSPage, BSDetailHeader } = window;

  // Live (Supabase) when signed in, ephemeral tweaks otherwise — shared with
  // the home tracker so completions and edits stay in sync across surfaces.
  const { habits, status, retry, create, remove: removeHabit, toggle } = _bsUseServerHabits(tweaks, setTweak);
  const [adding, setAdding] = useStateBSH(null); // 'do' | 'avoid' | null
  // Per-habit reminders (opt-in). Map habit_id → row; refreshed after each edit.
  const [reminders, setReminders] = React.useState({});
  const loadReminders = React.useCallback(() => {
    if (!window.ShapeHabitReminders?.list) return;
    window.ShapeHabitReminders.list().then(list => { const m = {}; (list || []).forEach(r => { m[r.habit_id] = r; }); setReminders(m); }).catch(() => {});
  }, []);
  React.useEffect(() => { loadReminders(); }, [loadReminders]);
  // Who hears about each habit (Shared habits). The share button shows only once this has read:
  // a failed read or a migration not yet run leaves it hidden rather than offering a dead end.
  const [watch, setWatch] = React.useState(null);
  const loadWatch = React.useCallback(() => {
    if (!window.ShapeHabitWatch?.list) return;
    window.ShapeHabitWatch.list().then(r => setWatch(r && r.kind === 'ready' ? r.byHabit : null)).catch(() => setWatch(null));
  }, []);
  React.useEffect(() => { loadWatch(); }, [loadWatch, habits.length]);
  const onCreate = async ({ name, type, domain }) => { if (await create({ name, type, domain, visibility: 'private' })) setAdding(null); };
  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={tr('habits:page.eyebrow', { defaultValue: 'Section · Habits' })}
        title={<>{tr('habits:page.titleLead', { defaultValue: 'Daily' })} <span style={{ color: teal }}>{tr('habits:page.titleAccent', { defaultValue: 'habits' })}</span></>}
      />
      {status !== 'ready' && <div role="status" style={{ padding: `16px ${t.padX}px 0`, color: t.INK }}><button onClick={retry} style={{ minHeight: 44 }}>{status === 'loading' ? tr('habits:page.loading', { defaultValue: 'Loading…' }) : tr('habits:toast.updateError', { defaultValue: 'Could not update habit' }) + ' ↻'}</button></div>}
      {status === 'ready' && <BSHabitToday habits={habits} onToggle={toggle} onRemove={removeHabit} onAdd={setAdding} reminders={reminders} onReminderChange={loadReminders} watch={watch} onShareChange={loadWatch} />}
      {status === 'ready' && habits.length > 0 && <BSHabitProgress habits={habits} />}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <button onClick={onOpenScore} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '9px 0 0' }}>
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70 }}>{tr('habits:score.shapeScore', { defaultValue: 'The Shape Score' })}</span>
          <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)' }} />
          <span aria-hidden style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK70 }}>→</span>
        </button>
      </div>
      <div style={{ height: 28 }} />
      {adding && <BSHabitAddSheet type={adding} accent={adding === 'avoid' ? t.RUST : teal} onClose={() => setAdding(null)} onCreate={onCreate} />}
    </BSPage>
  );
}

Object.assign(window, { BSHabitsPage, BSHabitShareSheet, _bsDecodeHabits, _bsEncodeHabits, _bsHabitPts, _BS_HABIT_DEMO_ROWS });
