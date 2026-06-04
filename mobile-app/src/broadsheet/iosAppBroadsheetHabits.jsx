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
        name: String(h.name || '').slice(0, 60),
        type: h.type === 'avoid' ? 'avoid' : 'do',
        remindAt: typeof h.remindAt === 'string' ? h.remindAt : '',
        visibility,
        public: visibility === 'public',
        pts: Number.isFinite(h.pts) ? h.pts : undefined,
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
    history: h.history || [],
  })));
}

// Small chrome-less time picker — opens native time input on tap
const _BS_HABIT_GRID_DAYS = ['THU', 'FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED'];
const _BS_HABIT_DEMO_ROWS = [
  { id: 'demo_sleep', type: 'do', name: 'Sleep 7+ hours', pattern: [1, 1, 0, 1, 1, 1, 2], pts: 22 },
  { id: 'demo_steps', type: 'do', name: '10,000 steps', pattern: [1, 1, 1, 1, 0, 1, 2], pts: 20 },
  { id: 'demo_water', type: 'do', name: '3 L water', pattern: [1, 0, 1, 1, 1, 0, 0], pts: 14 },
  { id: 'demo_protein', type: 'do', name: 'Protein at every meal', pattern: [1, 1, 1, 0, 1, 1, 2], pts: 22 },
  { id: 'demo_mobility', type: 'do', name: '10 min mobility', pattern: [0, 1, 0, 1, 0, 1, 0], pts: 12 },
  { id: 'demo_alcohol', type: 'avoid', name: 'No alcohol', pattern: [1, 1, 1, 1, 1, 1, 2], pts: 21 },
  { id: 'demo_screen', type: 'avoid', name: 'No screen after 10', pattern: [0, 1, 1, 0, 1, 1, 0], pts: 15 },
  { id: 'demo_soda', type: 'avoid', name: 'No soda or snacks', pattern: [1, 1, 1, 1, 1, 1, 2], pts: 21 },
  { id: 'demo_meals', type: 'avoid', name: 'No skipped meals', pattern: [1, 1, 0, 1, 1, 1, 2], pts: 19 },
];

function _bsHabitGridModel(habits) {
  if (!habits || habits.length === 0) {
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
  if (h && Number.isFinite(h.pts)) return h.pts;
  const s = String((h && (h.id || h.name)) || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i) * (i + 1)) % 997;
  return 4 + (n % 5); // stable 4–8
}

// One habit as a card — check, title, status line, points, remove (×).
function BSHabitRow({ habit, accent, onToggle, onRemove }) {
  const t = useBS();
  const done = (habit.history || []).includes(_bsHabitsToday);
  const isAvoid = habit.type === 'avoid';
  const pts = _bsHabitPts(habit);
  const c = accent;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 13,
      border: `1px solid ${done ? `${c}66` : t.RULE}`,
      background: done ? (t.isLight ? `${c}12` : `${c}1c`) : t.PAPER2,
    }}>
      <button onClick={() => onToggle(habit.id)} aria-label={done ? 'Mark not done' : 'Mark done'} style={{
        width: 25, height: 25, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
        border: `1.5px solid ${done ? c : t.RULE}`, background: done ? c : 'transparent',
        color: '#04201d', display: 'grid', placeItems: 'center',
        fontFamily: t.MONO, fontSize: 12, fontWeight: 900, padding: 0,
      }}>{done ? '✓' : ''}</button>
      <button onClick={() => onToggle(habit.id)} style={{ textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', padding: 0, minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{habit.name}</div>
        <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: done ? c : t.INK50 }}>
          {done ? (isAvoid ? '✓ Stayed clean' : '✓ Done') : `${isAvoid ? 'Avoid' : 'Do'} · +${pts} pts`}
        </div>
      </button>
      <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: done ? c : t.INK50, fontVariantNumeric: 'tabular-nums' }}>+{pts}</span>
      <button onClick={() => onRemove(habit.id)} aria-label="Remove habit" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: t.INK50, fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
    </div>
  );
}

// Section: "To-dos" / "To-don'ts" — count eyebrow, +Add link, card rows.
function BSHabitSection({ title, type, accent, habits, onToggle, onRemove, onAdd }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const done = habits.filter(h => (h.history || []).includes(_bsHabitsToday)).length;
  const word = type === 'avoid' ? 'Clean' : 'Done';
  return (
    <div style={{ padding: `${t.sectGap || 22}px ${t.padX}px 0` }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>{done}/{habits.length} {word}</div>
          <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.025em', color: t.INK, lineHeight: 1 }}>{title}</div>
        </div>
        <button onClick={onAdd} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, padding: 0 }}>+ Add →</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {habits.length === 0 ? (
          <button onClick={onAdd} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', padding: '16px 14px', borderRadius: 16, border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            + Add a {type === 'avoid' ? 'to-don’t' : 'to-do'}
          </button>
        ) : habits.map(h => (
          <BSHabitRow key={h.id} habit={h} accent={accent} onToggle={onToggle} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

// Top summary — points earned today vs possible, ring + tap → Shape Score.
function BSHabitScoreCard({ habits, onOpenScore }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const earned = habits.filter(h => (h.history || []).includes(_bsHabitsToday)).reduce((s, h) => s + _bsHabitPts(h), 0);
  const possible = habits.reduce((s, h) => s + _bsHabitPts(h), 0);
  const pct = possible ? Math.round((earned / possible) * 100) : 0;
  return (
    <button onClick={onOpenScore} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 16, border: `1px solid ${teal}44`, background: `linear-gradient(150deg, ${teal}1f, ${teal}07 55%, ${t.PAPER2} 92%), ${t.PAPER2}`, padding: 13, display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Earned today</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 5 }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 38, fontWeight: 700, letterSpacing: '-0.04em', color: t.INK, lineHeight: 1 }}>+{earned}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>pts</span>
          </div>
          <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase', color: teal, fontWeight: 600, lineHeight: 1.4 }}>of {possible} possible · to your Shape Score</div>
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 999, flexShrink: 0, background: `conic-gradient(${teal} ${pct * 3.6}deg, ${t.HAIR} 0deg)`, display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 37, height: 37, borderRadius: 999, background: t.PAPER, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, color: t.INK }}>{pct}%</div>
        </div>
      </div>
      <div style={{ height: 3, borderRadius: 999, background: t.HAIR, marginTop: 11, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: teal, borderRadius: 999 }} />
      </div>
      <div style={{ marginTop: 9, fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>Tap to see your Shape Score →</div>
    </button>
  );
}

const _BS_HABIT_SUGGEST = {
  do: ['Cold shower', 'Read 10 pages', 'Stretch', 'Meditate 5 min', 'Water 3L'],
  avoid: ['No soda', 'No snooze', 'No skipping breakfast', 'No takeout', 'No screens 1h pre-bed'],
};

// Bottom-sheet add flow — do / avoid variant, suggestion chips, points stepper.
function BSHabitAddSheet({ type, accent, onClose, onCreate }) {
  const t = useBS();
  const isAvoid = type === 'avoid';
  const onAccentInk = isAvoid ? '#2b0d07' : '#04201d';
  const [name, setName] = useStateBSH('');
  const [pts, setPts] = useStateBSH(5);
  const inputRef = React.useRef(null);
  React.useEffect(() => { const id = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(id); }, []);
  const suggestions = _BS_HABIT_SUGGEST[isAvoid ? 'avoid' : 'do'];
  const canAdd = name.trim().length > 0;
  const add = () => { if (!canAdd) return; onCreate({ name: name.trim(), type: isAvoid ? 'avoid' : 'do', pts }); };
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
            <button key={s} onClick={() => setName(s)} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>{s}</button>
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
    name: h.name,
    type: h.type === 'avoid' ? 'avoid' : 'do',
    cadence: h.cadence || 'daily',
    visibility: ['private', 'friends', 'public'].includes(h.visibility) ? h.visibility : 'private',
    public: h.visibility === 'public',
    pts: Number.isFinite(h.pts) ? h.pts : undefined,
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

  const create = ({ name, type = 'do', cadence = 'daily', visibility = 'private', pts }) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const ptsVal = Number.isFinite(pts) ? pts : undefined;
    if (useServer) {
      apiAction({ action: 'create', name: cleanName, type, cadence, visibility, pts: ptsVal })
        .then(d => { if (d && d.habit) setServer(prev => [...prev, ..._bsMapServerHabits([{ ...d.habit, pts: ptsVal, history: [] }])]); })
        .catch(() => window.__bsToast?.('Could not add habit', 'err'));
      return;
    }
    saveLocal([...local, { id: 'h_' + Math.random().toString(36).slice(2, 9), name: cleanName, type, cadence, visibility, public: visibility === 'public', pts: ptsVal, history: [] }]);
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
  const dos = habits.filter(h => h.type !== 'avoid');
  const donts = habits.filter(h => h.type === 'avoid');
  const onCreate = ({ name, type, pts }) => { create({ name, type, pts, visibility: 'private' }); setAdding(null); };
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
      <BSHabitSection title="To-dos" type="do" accent={teal} habits={dos} onToggle={toggle} onRemove={removeHabit} onAdd={() => setAdding('do')} />
      <BSHabitSection title="To-don'ts" type="avoid" accent={t.RUST} habits={donts} onToggle={toggle} onRemove={removeHabit} onAdd={() => setAdding('avoid')} />
      <div style={{ height: 28 }} />
      {adding && <BSHabitAddSheet type={adding} accent={adding === 'avoid' ? t.RUST : teal} onClose={() => setAdding(null)} onCreate={onCreate} />}
    </BSPage>
  );
}

Object.assign(window, { BSHabitsPage });
