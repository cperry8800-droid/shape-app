import React from 'react';
import { createPortal } from 'react-dom';
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

const _bsHabitsToday = '2026-05-14';

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
// Last 7 days ending on today (oldest first)
function _bsLast7() {
  const out = [];
  for (let i = 6; i >= 0; i--) out.push(_bsDateAdd(_bsHabitsToday, -i));
  return out;
}
// Letter for the day of week — anchored to May 14, 2026.
const _BS_DOW_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
function _bsDowLetter(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // 0=Sun … 6=Sat → Mon-first index
  const js = dt.getUTCDay();
  const idx = (js + 6) % 7;
  return _BS_DOW_LETTERS[idx];
}
// 3-letter day label (Mon-first) for the grid header.
const _BS_DOW3 = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
function _bsDow3(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return _BS_DOW3[(dt.getUTCDay() + 6) % 7];
}
// Compute current streak: longest run of consecutive days ending at today
// or yesterday (so an unchecked-today habit doesn't lose its streak yet).
function _bsStreakFromHistory(history) {
  if (!history || history.length === 0) return 0;
  const set = new Set(history);
  let cursor = set.has(_bsHabitsToday)
    ? _bsHabitsToday
    : (set.has(_bsDateAdd(_bsHabitsToday, -1)) ? _bsDateAdd(_bsHabitsToday, -1) : null);
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
        pts: Number.isFinite(h.pts) ? h.pts : undefined,
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
    pts: Number.isFinite(h.pts) ? h.pts : undefined,
    domain: h.domain === 'work' ? 'work' : undefined,
    history: h.history || [],
  })));
}

// Small chrome-less time picker — opens native time input on tap
const _BS_HABIT_GRID_DAYS = ['THU', 'FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED'];
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

function _bsHabitGridModel(habits) {
  if (!habits || habits.length === 0) {
    // Signed in with no habits yet → EMPTY (the page shows "add your first one");
    // the demo habit set is the signed-out preview only.
    const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
    if (signedIn) return { days: _bsLast7().map((d) => _bsDowLetter(d)), rows: [], demo: false };
    return { days: _BS_HABIT_GRID_DAYS, rows: _BS_HABIT_DEMO_ROWS, demo: true };
  }
  const dates = _bsLast7();
  const days = dates.map(d => _bsDowLetter(d));
  const rows = habits.map((h, i) => {
    const set = new Set(h.history || []);
    const pattern = dates.map(d => set.has(d) ? (d === _bsHabitsToday ? 2 : 1) : 0);
    const basePts = h.type === 'avoid' ? 16 : 18;
    return {
      id: h.id || `habit_${i}`,
      type: h.type === 'avoid' ? 'avoid' : 'do',
      name: h.name || 'Habit',
      visibility: ['private', 'friends', 'public'].includes(h.visibility) ? h.visibility : 'private',
      pattern,
      pts: pattern.reduce((sum, v) => sum + (v ? basePts / 7 : 0), 0),
    };
  });
  return { days, rows, demo: false };
}

function _bsHabitInsightStats(habits) {
  const model = _bsHabitGridModel(habits);
  if (model.demo) {
    return {
      score: 156,
      adherence: 78,
      lastWeek: 71,
      coach: 'Sleep is the one I want you to defend. If you are under 7 hours twice in a row, deload the next squat session.',
    };
  }
  const cells = model.rows.flatMap(r => r.pattern);
  const completed = cells.filter(Boolean).length;
  const total = Math.max(1, cells.length);
  const adherence = Math.round((completed / total) * 100);
  const score = Math.round(model.rows.reduce((sum, r) => {
    const hits = r.pattern.filter(Boolean).length;
    return sum + hits * (r.type === 'avoid' ? 3 : 4);
  }, 0));
  const sleep = model.rows.find(r => /sleep/i.test(r.name));
  const coach = sleep
    ? 'Sleep is the one I want you to defend. If you miss it twice in a row, adjust the next hard session.'
    : 'Keep the highest-impact rows boring and repeatable. The score will follow the consistency.';
  return {
    score,
    adherence,
    lastWeek: Math.max(0, adherence - 7),
    coach,
  };
}

function _bsHabitPts(h) {
  // Every habit completion awards a flat +3 to the Shape Score ledger
  // (2026-06-18-score-ledger-lockdown.sql). The old per-habit 4–8 fallback was a
  // fabricated display value that didn't match the award — reconciled to +3.
  if (h && Number.isFinite(h.pts)) return h.pts;
  return 3;
}

// One habit as a card — check, title, status line, points, remove (×).
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
  const r = reminder || {};
  const c = accent;
  const [on, setOn] = React.useState(!!reminder && r.enabled !== false);
  const [time, setTime] = React.useState(r.at_time || '09:00');
  const [days, setDays] = React.useState(Array.isArray(r.days) ? r.days.slice() : [1, 2, 3, 4, 5]);
  const toggleDay = (d) => setDays(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort((a, b) => a - b));
  const save = async () => {
    try {
      if (!on || !days.length) await window.ShapeHabitReminders?.remove?.(habit.id);
      else await window.ShapeHabitReminders?.set?.({ habitId: habit.id, label: habit.name, time, days, enabled: true });
    } catch (e) { window.__bsToast?.('Could not save reminder', 'err'); }
    onSaved && onSaved();
    onClose();
  };
  const chip = { flex: 1, padding: '7px 0', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' };
  const target = typeof document !== 'undefined' ? document.getElementById('bs-phone-surface') : null;
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '18px 18px 24px', borderTop: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: c }}>Habit reminder</div>
        <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>{habit.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingBottom: 14, borderBottom: `1px solid ${t.HAIR}` }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK }}>Remind me</div>
          <button onClick={() => setOn(v => !v)} aria-pressed={on} style={{ width: 46, height: 27, borderRadius: 999, border: `1px solid ${on ? c : t.RULE}`, background: on ? c : 'transparent', position: 'relative', cursor: 'pointer' }}>
            <span style={{ position: 'absolute', top: 2, left: on ? 21 : 2, width: 21, height: 21, borderRadius: 999, background: on ? '#fff' : t.INK50 }} />
          </button>
        </div>
        {on && (
          <React.Fragment>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${t.HAIR}` }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK }}>Time</div>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ background: 'transparent', color: c, border: `1px solid ${t.RULE}`, borderRadius: 999, padding: '6px 10px', fontFamily: t.MONO, fontSize: 12, fontWeight: 800, cursor: 'pointer' }} />
            </div>
            <div style={{ padding: '14px 0' }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, marginBottom: 10 }}>Days</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {_BS_REM_DAYS.map(([lab, d], i) => { const dn = days.includes(d); return (
                  <button key={i} onClick={() => toggleDay(d)} style={{ flex: 1, height: 36, borderRadius: 8, border: `1px solid ${dn ? c : t.RULE}`, background: dn ? `${c}22` : 'transparent', color: dn ? c : t.INK50, fontFamily: t.MONO, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{lab}</button>
                ); })}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => setDays([1, 2, 3, 4, 5])} style={chip}>Weekdays</button>
                <button onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} style={chip}>Every day</button>
              </div>
            </div>
          </React.Fragment>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', padding: '12px 18px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} style={{ flex: 1, padding: '12px', borderRadius: 999, background: c, color: '#04201d', border: 0, fontFamily: t.BODY, fontSize: 13.5, fontWeight: 760, cursor: 'pointer' }}>{on && days.length ? 'Save reminder' : 'Turn off'}</button>
        </div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>Off by default · skipped once you check it off · never nagging</div>
      </div>
    </div>
  );
  return target ? createPortal(sheet, target) : sheet;
}
function BSHabitRow({ habit, accent, onToggle, onRemove, reminder, onReminderChange, first = false }) {
  const t = useBS();
  const done = (habit.history || []).includes(_bsHabitsToday);
  const isAvoid = habit.type === 'avoid';
  const pts = _bsHabitPts(habit);
  const c = accent;
  const [remOpen, setRemOpen] = React.useState(false);
  const hasRem = !!reminder && reminder.enabled !== false;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 10,
      padding: '11px 0', minHeight: 44, borderTop: first ? 0 : `1px solid ${t.HAIR}`,
    }}>
      <button onClick={() => onToggle(habit.id)} aria-label={done ? 'Mark not done' : 'Mark done'} style={{
        width: 24, height: 24, borderRadius: 3, cursor: 'pointer', flexShrink: 0,
        border: `1.5px solid ${done ? c : `${c}55`}`, background: done ? c : 'transparent',
        color: '#04201d', display: 'grid', placeItems: 'center',
        fontFamily: t.MONO, fontSize: 12, fontWeight: 900, padding: 0,
      }}>{done ? '✓' : ''}</button>
      <button onClick={() => onToggle(habit.id)} style={{ textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', padding: 0, minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{habit.name}</div>
        <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: done ? c : t.INK50 }}>
          {habit.domain === 'work' && <span style={{ color: t.BLUE }}>Work · </span>}
          {done ? (isAvoid ? '✓ Stayed clean' : '✓ Kept') : `${isAvoid ? 'Avoid' : 'Do'} · +${pts} pts`}
        </div>
      </button>
      <button onClick={(e) => { e.stopPropagation(); setRemOpen(true); }} aria-label="Habit reminder" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: hasRem ? c : t.INK50, padding: '0 1px', display: 'grid', placeItems: 'center', lineHeight: 0 }}>{_bsBellIcon(hasRem, hasRem ? c : t.INK50)}</button>
      <button onClick={async () => { if (await window.bsAskConfirm({ title: 'Delete this habit?', name: habit.name, message: "This removes the habit and its full streak history.", confirmLabel: 'Delete habit' })) onRemove(habit.id); }} aria-label="Remove habit" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: t.INK50, fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
      {remOpen && <BSHabitReminderSheet habit={habit} reminder={reminder} accent={c} onClose={() => setRemOpen(false)} onSaved={onReminderChange} />}
    </div>
  );
}

// Section: "To do" / "To don't" — a station head (accent tick + mono count)
// over tick-divider rows; ＋ Add is an underline text-action.
function BSHabitSection({ title, type, accent, habits, onToggle, onRemove, onAdd, reminders, onReminderChange }) {
  const t = useBS();
  const done = habits.filter(h => (h.history || []).includes(_bsHabitsToday)).length;
  const word = type === 'avoid' ? 'Stayed clean' : 'Done';
  return (
    <div style={{ padding: `${t.sectGap || 22}px ${t.padX}px 0` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span aria-hidden style={{ flexShrink: 0, width: 10, height: 3, background: accent }} />
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{title} · {done}/{habits.length} {word}</span>
        <span aria-hidden style={{ flex: 1 }} />
        <button onClick={onAdd} style={{ background: 'transparent', border: 0, cursor: 'pointer', minHeight: 32, padding: '4px 0', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${accent}`, paddingBottom: 2 }}>＋ Add</span></button>
      </div>
      {habits.length === 0 ? (
        <button onClick={onAdd} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', padding: '16px 14px', border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 8 }}>
          ＋ Add a {type === 'avoid' ? 'to-don’t' : 'to-do'}
        </button>
      ) : habits.map((h, i) => (
        <BSHabitRow key={h.id} habit={h} first={i === 0} accent={accent} onToggle={onToggle} onRemove={onRemove} reminder={reminders && reminders[h.id]} onReminderChange={onReminderChange} />
      ))}
    </div>
  );
}

// The day's ledger — a serif verdict over a bare register (the plate, % ring
// and split bars died with the Habit Ledger; the register carries them all).
function BSHabitScoreCard({ habits, onOpenScore }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const week = _bsHabitInsightStats(habits); // this week's Shape Score from habits + adherence
  const earned = habits.filter(h => (h.history || []).includes(_bsHabitsToday)).reduce((s, h) => s + _bsHabitPts(h), 0);
  const possible = habits.reduce((s, h) => s + _bsHabitPts(h), 0);
  const remaining = possible - earned;
  const sumE = (list) => list.filter(h => (h.history || []).includes(_bsHabitsToday)).reduce((s, h) => s + _bsHabitPts(h), 0);
  const sumP = (list) => list.reduce((s, h) => s + _bsHabitPts(h), 0);
  const dos = habits.filter(h => h.type !== 'avoid');
  const donts = habits.filter(h => h.type === 'avoid');
  return (
    <div>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.3, color: t.INK }}>
        {possible === 0
          ? <>Add a habit — <span style={{ fontStyle: 'italic', color: teal }}>daily points live here.</span></>
          : earned === 0
            ? <>Nothing banked yet — <span style={{ fontStyle: 'italic', color: teal }}>{possible} pts on the table.</span></>
            : remaining > 0
              ? <>+{earned} banked today — <span style={{ fontStyle: 'italic', color: teal }}>{remaining} more on the table.</span></>
              : <>+{earned} banked today — <span style={{ fontStyle: 'italic', color: teal }}>a clean sweep.</span></>}
      </div>
      <div style={{ marginTop: 13, display: 'grid', gridTemplateColumns: 'repeat(5, auto)', justifyContent: 'space-between', gap: 8 }}>
        {[
          ['Today', `+${earned}/${possible}`, t.INK50],
          ['To do', `${sumE(dos)}/${sumP(dos)}`, teal],
          ["To don't", `${sumE(donts)}/${sumP(donts)}`, t.RUST],
          ['This wk', `+${week.score}`, t.INK50],
          ['Adherence', `${week.adherence}%`, t.INK50],
        ].map(([l, v, lc]) => (
          <div key={l}>
            <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', fontWeight: 800, textTransform: 'uppercase', color: lc }}>{l}</div>
            <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>
      <div aria-hidden style={{ marginTop: 10, height: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />
      <button onClick={onOpenScore} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 40, boxSizing: 'border-box', padding: '9px 0 0' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>The Shape Score</span>
        <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)' }} />
        <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>→</span>
      </button>
    </div>
  );
}

// 7-day completion grid — DO / DON'T rows × the last 7 days, an unboxed
// station (the plate chrome died with the Habit Ledger). Squared completion
// tiles; today is the rightmost column (pattern value 2), accent-marked.
function BSHabitGrid({ habits }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const model = _bsHabitGridModel(habits);
  if (!model.rows.length) return null;
  const days = model.demo ? _BS_HABIT_GRID_DAYS : _bsLast7().map(_bsDow3);
  const lastIdx = days.length - 1; // today is the rightmost column
  // One cell: done-today (solid teal + glow) · done-past (teal tint) ·
  // today-pending (teal outline) · past-empty (hairline outline).
  const Cell = ({ v, today }) => {
    let background = 'transparent';
    let border = `1px solid ${t.RULE}`;
    let boxShadow = 'none';
    if (v === 2) { background = teal; border = `1px solid ${teal}`; boxShadow = `0 0 7px ${teal}66`; }
    else if (v === 1) { background = `${teal}b3`; border = `1px solid ${teal}b3`; }
    else if (today) { background = `${teal}14`; border = `1px solid ${teal}80`; }
    return <div style={{ height: 17, borderRadius: 3, background, border, boxShadow }} />;
  };
  const NAME_FLEX = '1 1 44%';
  const DOTS_FLEX = '1 1 56%';
  return (
    <div>
      {/* header — mono eyebrow + serif display title + ink→accent ledger */}
      <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal }}>Last 7 days</div>
      <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>The grid<span style={{ color: teal }}>.</span></div>
      <div aria-hidden style={{ height: 2, width: 44, borderRadius: 1, marginTop: 9, background: `linear-gradient(90deg, ${t.INK}, ${teal} 70%, transparent)` }} />
      {/* day-label header — aligned over the tile columns; today in accent */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13, marginBottom: 9 }}>
        <div style={{ flex: NAME_FLEX, minWidth: 0 }} />
        <div style={{ flex: DOTS_FLEX, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
          {days.map((d, i) => {
            const today = i === lastIdx;
            return <div key={i} style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8, fontWeight: today ? 800 : 700, letterSpacing: '0.02em', color: today ? teal : t.INK50 }}>{d}</div>;
          })}
        </div>
      </div>
      {model.rows.map((r, idx) => {
        const isAvoid = r.type === 'avoid';
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: idx ? `1px solid ${t.HAIR}` : 0 }}>
            <div style={{ flex: NAME_FLEX, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', color: isAvoid ? t.RUST : teal }}>{isAvoid ? "DON'T" : 'DO'}</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            </div>
            <div style={{ flex: DOTS_FLEX, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {r.pattern.map((v, i) => <Cell key={i} v={v} today={i === lastIdx} />)}
            </div>
          </div>
        );
      })}
    </div>
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
  const isAvoid = type === 'avoid';
  const onAccentInk = isAvoid ? '#2b0d07' : '#04201d';
  const [name, setName] = useStateBSH('');
  const [pts, setPts] = useStateBSH(5);
  // domain:'work' — set by the work chips or the WORK toggle; a plain chip or
  // hand-typed habit stays domain-less (honest-absent, never name-inferred).
  const [domain, setDomain] = useStateBSH('');
  const inputRef = React.useRef(null);
  React.useEffect(() => { const id = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(id); }, []);
  const suggestions = _BS_HABIT_SUGGEST[isAvoid ? 'avoid' : 'do'];
  const workSuggestions = _BS_HABIT_SUGGEST[isAvoid ? 'workAvoid' : 'workDo'];
  const canAdd = name.trim().length > 0;
  const add = () => { if (!canAdd) return; onCreate({ name: name.trim(), type: isAvoid ? 'avoid' : 'do', pts, domain: domain || undefined }); };
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `10px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: t.RULE, margin: '0 auto 14px' }} />
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent }}>New {isAvoid ? 'to-don’t' : 'to-do'}</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>Something to <span style={{ fontStyle: 'italic', color: accent }}>{isAvoid ? 'avoid.' : 'do.'}</span></div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          maxLength={60}
          placeholder={isAvoid ? 'e.g. No second coffee' : 'e.g. 10 min walk after lunch'}
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
          <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>Work</span>
          <span aria-hidden style={{ flex: 1 }} />
          <button onClick={() => setDomain(d => d === 'work' ? '' : 'work')} aria-pressed={domain === 'work'} style={{ background: 'transparent', border: `1px solid ${domain === 'work' ? t.BLUE : t.RULE}`, borderRadius: 999, padding: '6px 11px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: domain === 'work' ? t.BLUE : t.INK50 }}>{domain === 'work' ? '✓ Work habit' : 'Work habit'}</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
          {workSuggestions.map(s => (
            <button key={s} onClick={() => { setName(s); setDomain('work'); }} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${t.BLUE}55`, background: `${t.BLUE}14`, color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>{s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>Points</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => setPts(p => Math.max(1, p - 1))} aria-label="Fewer points" style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>−</button>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: accent, letterSpacing: '-0.03em', minWidth: 44, textAlign: 'center' }}>+{pts}</span>
            <button onClick={() => setPts(p => Math.min(20, p + 1))} aria-label="More points" style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', padding: '14px 22px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Cancel</button>
          <button onClick={add} disabled={!canAdd} style={{ flex: 1, padding: '14px', borderRadius: 999, border: 0, background: canAdd ? accent : t.RULE, color: canAdd ? onAccentInk : t.INK50, cursor: canAdd ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Add habit</button>
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
    pts: Number.isFinite(h.pts) ? h.pts : undefined,
    domain: h.domain === 'work' ? 'work' : undefined,
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
  const loggedIn = !!(typeof window !== 'undefined' && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user);
  const [serverHabits, setServerHabits] = useStateBSH(null);

  React.useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    fetch('/api/client/habits', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d || !Array.isArray(d.habits)) return;
        const mapped = _bsMapServerHabits(d.habits);
        setServerHabits(mapped);
        try { setTweak('habits', _bsEncodeHabits(mapped)); } catch (e) { /* mirror best-effort */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loggedIn]);

  const local = _bsDecodeHabits(tweaks.habits);
  const useServer = loggedIn && serverHabits != null;
  const habits = useServer ? serverHabits : local;
  const saveLocal = (next) => setTweak('habits', _bsEncodeHabits(next));
  const apiAction = (body) => fetch('/api/client/habits', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => (r.ok ? r.json() : r.json().then(e => Promise.reject(e))));
  // Apply a server-state update and mirror the result into tweaks so the home
  // summary card (which reads tweaks.habits) stays in sync.
  const setServer = (updater) => setServerHabits(prev => {
    const next = updater(prev || []);
    try { setTweak('habits', _bsEncodeHabits(next)); } catch (e) { /* best-effort mirror */ }
    return next;
  });

  const create = ({ name, type = 'do', cadence = 'daily', visibility = 'private', pts, domain }) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const ptsVal = Number.isFinite(pts) ? pts : undefined;
    const dom = domain === 'work' ? 'work' : undefined;
    if (useServer) {
      apiAction({ action: 'create', name: cleanName, type, cadence, visibility, pts: ptsVal, domain: dom })
        .then(d => { if (d && d.habit) setServer(prev => [...prev, ..._bsMapServerHabits([{ ...d.habit, pts: ptsVal, domain: (d.habit.domain === 'work' ? 'work' : dom), history: [] }])]); })
        .catch(() => window.__bsToast?.('Could not add habit', 'err'));
      return;
    }
    saveLocal([...local, { id: 'h_' + Math.random().toString(36).slice(2, 9), name: cleanName, type, cadence, visibility, public: visibility === 'public', pts: ptsVal, domain: dom, history: [] }]);
  };

  const upsert = (h) => {
    if (useServer) {
      const exists = (serverHabits || []).some(x => x.id === h.id);
      if (exists) {
        setServer(prev => prev.map(x => x.id === h.id ? { ...x, ...h } : x));
        apiAction({ action: 'update', id: h.id, name: h.name, type: h.type, cadence: h.cadence, visibility: h.visibility }).catch(() => {});
      } else {
        apiAction({ action: 'create', name: h.name, type: h.type, cadence: h.cadence || 'daily', visibility: h.visibility || 'private' })
          .then(d => { if (d && d.habit) setServer(prev => [...prev, ..._bsMapServerHabits([{ ...d.habit, history: h.history || [] }])]); })
          .catch(() => window.__bsToast?.('Could not add habit', 'err'));
      }
      return;
    }
    const exists = local.find(x => x.id === h.id);
    saveLocal(exists ? local.map(x => x.id === h.id ? h : x) : [...local, h]);
  };

  const remove = (id) => {
    if (useServer) {
      setServer(prev => prev.filter(h => h.id !== id));
      apiAction({ action: 'delete', id }).catch(() => {});
    } else {
      saveLocal(local.filter(h => h.id !== id));
    }
    window.__bsToast?.('Habit removed', 'ok');
  };

  const setVisibility = (id, visibility) => {
    if (useServer) {
      setServer(prev => prev.map(h => h.id === id ? { ...h, visibility, public: visibility === 'public' } : h));
      apiAction({ action: 'update', id, visibility }).catch(() => {});
    } else {
      saveLocal(local.map(h => h.id === id ? { ...h, visibility, public: visibility === 'public' } : h));
    }
    window.__bsToast?.(
      visibility === 'public' ? 'Made public'
        : visibility === 'friends' ? 'Shared with friends'
        : 'Set to private',
      'ok',
    );
  };

  const toggle = (id) => {
    if (window.bsRequireAccount && !window.bsRequireAccount('track habits')) return;
    const applyToggle = (list) => list.map(h => {
      if (h.id !== id) return h;
      const hist = new Set(h.history || []);
      if (hist.has(_bsHabitsToday)) hist.delete(_bsHabitsToday);
      else hist.add(_bsHabitsToday);
      return { ...h, history: [...hist].sort() };
    });
    if (useServer) {
      setServer(applyToggle);
      apiAction({ action: 'toggle', id, date: _bsHabitsToday }).catch(() => {
        setServer(applyToggle); // revert the optimistic flip on failure
        window.__bsToast?.('Could not update habit', 'err');
      });
    } else {
      saveLocal(applyToggle(local));
    }
  };

  return { loggedIn, useServer, habits, create, upsert, remove, setVisibility, toggle };
}


function BSHabitsPage({ onBack, onOpenScore, tweaks, setTweak, accent }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const { BSPage, BSDetailHeader } = window;

  // Live (Supabase) when signed in, ephemeral tweaks otherwise — shared with
  // the home tracker so completions and edits stay in sync across surfaces.
  const { habits, create, remove: removeHabit, toggle } = _bsUseServerHabits(tweaks, setTweak);
  const [adding, setAdding] = useStateBSH(null); // 'do' | 'avoid' | null
  // Per-habit reminders (opt-in). Map habit_id → row; refreshed after each edit.
  const [reminders, setReminders] = React.useState({});
  const loadReminders = React.useCallback(() => {
    if (!window.ShapeHabitReminders?.list) return;
    window.ShapeHabitReminders.list().then(list => { const m = {}; (list || []).forEach(r => { m[r.habit_id] = r; }); setReminders(m); }).catch(() => {});
  }, []);
  React.useEffect(() => { loadReminders(); }, [loadReminders]);
  const dos = habits.filter(h => h.type !== 'avoid');
  const donts = habits.filter(h => h.type === 'avoid');
  const onCreate = ({ name, type, pts, domain }) => { create({ name, type, pts, domain, visibility: 'private' }); setAdding(null); };
  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Section · Habits"
        title={<>Daily <span style={{ color: teal }}>habits</span></>}
      />
      <div style={{ padding: `4px ${t.padX}px 0` }}>
        <BSHabitScoreCard habits={habits} onOpenScore={onOpenScore} />
      </div>
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <BSHabitGrid habits={habits} />
      </div>
      <BSHabitSection title="To do" type="do" accent={teal} habits={dos} onToggle={toggle} onRemove={removeHabit} onAdd={() => setAdding('do')} reminders={reminders} onReminderChange={loadReminders} />
      <BSHabitSection title="To don't" type="avoid" accent={t.RUST} habits={donts} onToggle={toggle} onRemove={removeHabit} onAdd={() => setAdding('avoid')} reminders={reminders} onReminderChange={loadReminders} />
      <div style={{ height: 28 }} />
      {adding && <BSHabitAddSheet type={adding} accent={adding === 'avoid' ? t.RUST : teal} onClose={() => setAdding(null)} onCreate={onCreate} />}
    </BSPage>
  );
}

Object.assign(window, { BSHabitsPage, _bsDecodeHabits, _bsEncodeHabits, _bsHabitPts, _BS_HABIT_DEMO_ROWS });
