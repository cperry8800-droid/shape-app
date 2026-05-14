import React from 'react';
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

function BSHabitInsights({ habits, accent, onOpenScore }) {
  const t = useBS();
  const model = _bsHabitGridModel(habits);
  const stats = _bsHabitInsightStats(habits);
  const teal = accent || '#147b68';
  const hot = '#10c8b1';
  const cardBg = '#1a1713';
  const scoreBg = '#0d1b14';
  const cardInk = '#f7f1e6';
  const muted = 'rgba(247,241,230,0.58)';
  const border = 'rgba(247,241,230,0.12)';
  const missed = 'rgba(247,241,230,0.08)';

  const Cell = ({ value }) => (
    <div style={{
      height: 28,
      minWidth: 0,
      borderRadius: 999,
      background: value === 2 ? hot : value ? teal : missed,
      border: value ? 'none' : `1px solid ${border}`,
      boxShadow: value === 2 ? `0 0 0 1px ${hot}` : 'none',
    }} />
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
      <div style={{
        borderRadius: 10,
        border: `1px solid ${border}`,
        background: cardBg,
        color: cardInk,
        padding: 18,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 800 }}>Grid</div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', color: muted, textTransform: 'uppercase' }}>Last 7 days</div>
        </div>

        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '118px repeat(7, minmax(0, 1fr))', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <div />
            {model.days.map((d, i) => (
              <div key={`${d}_${i}`} style={{
                fontFamily: t.MONO,
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: '0.18em',
                textAlign: 'center',
                color: muted,
              }}>{d}</div>
            ))}
          </div>

          {model.rows.map((row, rowIndex) => (
            <div key={row.id} style={{
              display: 'grid',
              gridTemplateColumns: '118px repeat(7, minmax(0, 1fr))',
              gap: 6,
              alignItems: 'center',
              padding: '9px 0',
              borderTop: rowIndex > 0 ? `1px solid rgba(247,241,230,0.07)` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{
                  fontFamily: t.MONO,
                  fontSize: 8,
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                  color: row.type === 'avoid' ? '#ff6a5c' : hot,
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}>{row.type === 'avoid' ? "Don't" : 'Do'}</span>
                <span style={{
                  fontFamily: t.DISPLAY,
                  fontSize: 13,
                  fontWeight: 700,
                  color: cardInk,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{row.name}</span>
              </div>
              {row.pattern.map((value, i) => <Cell key={`${row.id}_${i}`} value={value} />)}
            </div>
          ))}
        </div>
      </div>

      <div style={{
        order: -1,
        borderRadius: 10,
        border: `1px solid ${teal}`,
        background: scoreBg,
        color: cardInk,
        padding: 18,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 900, letterSpacing: '0.22em', color: hot, textTransform: 'uppercase' }}>
          Shape Score · From Habits
        </div>
        <div style={{ fontFamily: t.SERIF || t.DISPLAY, fontSize: 54, lineHeight: 0.95, marginTop: 14, color: hot, letterSpacing: '-0.06em' }}>
          +{stats.score}
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, marginTop: 14, color: 'rgba(247,241,230,0.78)' }}>
          Earned from habits this week. Each row's +pts rolls into your Shape Score nightly.
        </div>
        <button type="button" onClick={onOpenScore || (() => window.__bsToast?.('Shape Score opened', 'ok'))} style={{ display: 'inline-flex', alignItems: 'center', marginTop: 18, padding: 0, border: 0, background: 'transparent', color: hot, fontFamily: t.MONO, fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: 'pointer' }}>
          See full breakdown →
        </button>
      </div>

      <div style={{
        borderRadius: 10,
        border: `1px solid ${border}`,
        background: cardBg,
        color: cardInk,
        padding: 18,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 800 }}>Two-week trend</div>
        <div style={{ fontFamily: t.SERIF || t.DISPLAY, fontSize: 48, lineHeight: 1, marginTop: 18, letterSpacing: '-0.06em' }}>{stats.adherence}%</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: muted, marginTop: 8 }}>
          Adherence · vs {stats.lastWeek}% last week
        </div>
      </div>

      <div style={{
        borderRadius: 10,
        border: `1px solid ${border}`,
        background: cardBg,
        color: cardInk,
        padding: 18,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 900, letterSpacing: '0.22em', color: hot, textTransform: 'uppercase' }}>
          From Maya · Mon
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.45, marginTop: 12 }}>
          {stats.coach}
        </div>
      </div>
    </div>
  );
}

function BSTimeChip({ value, onChange, ink, mono }) {
  const ref = React.useRef(null);
  const display = value || '— : —';
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', border: `1px solid ${ink}`, cursor: 'pointer',
      fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: ink,
      fontVariantNumeric: 'tabular-nums', position: 'relative',
      borderRadius: 6,
    }}>
      <span style={{ fontSize: 9, opacity: 0.6 }}>◷</span>
      <span>{display}</span>
      <input
        ref={ref}
        type="time"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
          width: '100%', height: '100%', border: 'none', background: 'transparent',
        }}
      />
    </label>
  );
}

// One row in the habit list — checkbox-style, broadsheet styling
function BSHabitRowLegacy({ habit, onToggle, onEdit, last }) {
  const t = useBS();
  const week = _bsLast7();
  const set = new Set(habit.history || []);
  const checked = set.has(_bsHabitsToday);
  const isAvoid = habit.type === 'avoid';
  const accent = isAvoid ? '#ff6a5c' : '#65b878';
  const streak = _bsStreakFromHistory(habit.history);
  const darkPaper = '#f7f1e6';
  const darkMuted = 'rgba(247,241,230,0.54)';
  const darkRule = 'rgba(247,241,230,0.12)';
  const rowBg = checked
    ? (isAvoid ? 'rgba(255,106,92,0.12)' : 'rgba(101,184,120,0.16)')
    : 'rgba(247,241,230,0.045)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '34px 1fr 28px',
      alignItems: 'start',
      gap: 12,
      padding: 12,
      marginTop: last ? 10 : 10,
      border: `1px solid ${checked ? `${accent}77` : darkRule}`,
      borderRadius: 14,
      background: rowBg,
      boxShadow: checked ? '0 12px 28px rgba(0,0,0,0.18)' : 'none',
    }}>
      {/* Check / cross box */}
      <button
        onClick={() => onToggle(habit.id)}
        aria-label={checked ? 'Mark not done' : 'Mark done'}
        style={{
          width: 34,
          height: 34,
          flexShrink: 0,
          border: `1.5px solid ${checked ? accent : 'rgba(247,241,230,0.78)'}`,
          background: checked ? accent : 'transparent',
          color: checked ? '#07100d' : darkPaper,
          fontFamily: t.MONO, fontWeight: 900, fontSize: 13,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer', padding: 0,
          borderRadius: 10,
          transition: 'background 120ms',
        }}
      >
        {checked ? (isAvoid ? '×' : '✓') : ''}
      </button>

      {/* Name + meta + 7-day strip */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: t.DISPLAY,
          fontWeight: 650,
          fontSize: 16,
          lineHeight: 1.15,
          color: darkPaper,
          letterSpacing: '-0.018em',
          textDecoration: checked && !isAvoid ? 'line-through' : 'none',
          textDecorationColor: 'rgba(247,241,230,0.48)',
          opacity: checked && !isAvoid ? 0.68 : 1,
        }}>
          {habit.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: t.MONO, fontSize: 8, fontWeight: 900,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            color: accent,
          }}>
            {isAvoid ? '✕ Avoid' : '✓ Daily'}
          </span>
          {habit.remindAt && (
            <span style={{
              fontFamily: t.MONO, fontSize: 9.5, color: darkMuted,
              letterSpacing: '0.12em', fontVariantNumeric: 'tabular-nums',
            }}>
              ◷ {habit.remindAt}
            </span>
          )}
          {streak > 0 && (
            <span style={{
              fontFamily: t.MONO, fontSize: 9.5, color: '#d3a133',
              letterSpacing: '0.12em', fontWeight: 700,
            }}>
              {streak}d streak
            </span>
          )}
          {habit.visibility !== 'private' && (
            <span style={{
              fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#07100d', background: '#d3a133',
              padding: '1px 6px',
            }}>
              {habit.visibility === 'friends' ? 'Friends' : 'Public'}
            </span>
          )}
        </div>

        {/* 7-day strip — last 7 days, oldest left → today right */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {week.map((date, i) => {
            const did = set.has(date);
            const isToday = date === _bsHabitsToday;
            return (
              <div key={date} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3,
              }}>
                <div style={{
                  width: '100%', height: 14,
                  background: did ? accent : 'transparent',
                  border: `1px solid ${isToday ? darkPaper : darkRule}`,
                  borderRadius: 2,
                }} />
                <span style={{
                  fontFamily: t.MONO, fontSize: 7.5,
                  letterSpacing: '0.1em',
                  color: isToday ? darkPaper : darkMuted,
                  fontWeight: isToday ? 800 : 500,
                }}>
                  {_bsDowLetter(date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit affordance */}
      <button
        onClick={() => onEdit(habit.id)}
        aria-label="Edit habit"
        style={{
          background: 'transparent', border: 'none',
          fontFamily: t.MONO, fontSize: 18, color: darkMuted,
          cursor: 'pointer', padding: 4, lineHeight: 1, marginTop: 2,
        }}
      >
        ⋯
      </button>
    </div>
  );
}

function BSHabitRowCurrentLegacy({ habit, onToggle, onEdit, last }) {
  const t = useBS();
  const week = _bsLast7();
  const set = new Set(habit.history || []);
  const checked = set.has(_bsHabitsToday);
  const isAvoid = habit.type === 'avoid';
  const accent = isAvoid ? '#ff6a5c' : '#65b878';
  const streak = _bsStreakFromHistory(habit.history);
  const ink = '#f7f1e6';
  const muted = 'rgba(247,241,230,0.54)';
  const rule = 'rgba(247,241,230,0.12)';
  const rowBg = checked
    ? (isAvoid ? 'rgba(255,106,92,0.12)' : 'rgba(101,184,120,0.16)')
    : 'rgba(247,241,230,0.045)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '34px 1fr 28px',
      alignItems: 'start',
      gap: 12,
      padding: 12,
      marginTop: last ? 10 : 10,
      border: `1px solid ${checked ? `${accent}77` : rule}`,
      borderRadius: 14,
      background: rowBg,
      boxShadow: checked ? '0 12px 28px rgba(0,0,0,0.18)' : 'none',
    }}>
      <button
        onClick={() => onToggle(habit.id)}
        aria-label={checked ? 'Mark not done' : 'Mark done'}
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: `1.5px solid ${checked ? accent : 'rgba(247,241,230,0.78)'}`,
          background: checked ? accent : 'transparent',
          color: checked ? '#07100d' : ink,
          fontFamily: t.MONO,
          fontWeight: 900,
          fontSize: 13,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {checked ? (isAvoid ? 'x' : '✓') : ''}
      </button>

      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: t.DISPLAY,
          fontWeight: 650,
          fontSize: 16,
          lineHeight: 1.15,
          color: ink,
          letterSpacing: '-0.018em',
          textDecoration: checked && !isAvoid ? 'line-through' : 'none',
          textDecorationColor: 'rgba(247,241,230,0.48)',
          opacity: checked && !isAvoid ? 0.68 : 1,
        }}>
          {habit.name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: t.MONO,
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: accent,
          }}>
            {isAvoid ? 'Avoid' : 'Daily'}
          </span>
          {habit.remindAt && (
            <span style={{
              fontFamily: t.MONO,
              fontSize: 8,
              color: muted,
              letterSpacing: '0.12em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {habit.remindAt}
            </span>
          )}
          {streak > 0 && (
            <span style={{
              fontFamily: t.MONO,
              fontSize: 8,
              color: '#d3a133',
              letterSpacing: '0.12em',
              fontWeight: 800,
            }}>
              {streak}d streak
            </span>
          )}
          {habit.visibility !== 'private' && (
            <span style={{
              fontFamily: t.MONO,
              fontSize: 7.5,
              fontWeight: 900,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#07100d',
              background: '#d3a133',
              padding: '3px 6px',
              borderRadius: 999,
            }}>
              {habit.visibility === 'friends' ? 'Friends' : 'Public'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 9 }}>
          {week.map((date) => {
            const did = set.has(date);
            const isToday = date === _bsHabitsToday;
            return (
              <div key={date} style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
              }}>
                <div style={{
                  width: '100%',
                  height: 14,
                  background: did ? accent : 'transparent',
                  border: `1px solid ${isToday ? 'rgba(247,241,230,0.85)' : rule}`,
                  borderRadius: 5,
                }} />
                <span style={{
                  fontFamily: t.MONO,
                  fontSize: 7,
                  letterSpacing: '0.1em',
                  color: isToday ? ink : muted,
                  fontWeight: isToday ? 800 : 500,
                }}>
                  {_bsDowLetter(date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onEdit(habit.id)}
        aria-label="Edit habit"
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          background: 'rgba(247,241,230,0.055)',
          border: '1px solid rgba(247,241,230,0.08)',
          fontFamily: t.MONO,
          fontSize: 15,
          color: muted,
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        }}
      >
        ...
      </button>
    </div>
  );
}

function BSHabitRow({ habit, onToggle, onEdit, last }) {
  const t = useBS();
  const week = _bsLast7();
  const set = new Set(habit.history || []);
  const checked = set.has(_bsHabitsToday);
  const isAvoid = habit.type === 'avoid';
  const accent = isAvoid ? '#ff6a5c' : '#65b878';
  const streak = _bsStreakFromHistory(habit.history);
  const ink = '#f7f1e6';
  const muted = 'rgba(247,241,230,0.52)';
  const rule = 'rgba(247,241,230,0.10)';
  const rowBg = checked
    ? (isAvoid ? 'rgba(255,106,92,0.10)' : 'rgba(101,184,120,0.10)')
    : 'rgba(247,241,230,0.032)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '30px 1fr 24px',
      alignItems: 'center',
      gap: 11,
      padding: '11px 10px',
      marginTop: 8,
      border: `1px solid ${checked ? `${accent}55` : rule}`,
      borderRadius: 16,
      background: rowBg,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <span style={{
        position: 'absolute',
        left: 0,
        top: 10,
        bottom: 10,
        width: 3,
        borderRadius: '0 999px 999px 0',
        background: checked ? accent : 'rgba(247,241,230,0.16)',
      }} />

      <button
        onClick={() => onToggle(habit.id)}
        aria-label={checked ? 'Mark not done' : 'Mark done'}
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          border: `1.5px solid ${checked ? accent : 'rgba(247,241,230,0.72)'}`,
          background: checked ? accent : 'transparent',
          color: checked ? '#07100d' : ink,
          fontFamily: t.MONO,
          fontWeight: 900,
          fontSize: 12,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {checked ? (isAvoid ? 'x' : '✓') : ''}
      </button>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{
            fontFamily: t.DISPLAY,
            fontWeight: 650,
            fontSize: 15.5,
            lineHeight: 1.1,
            color: ink,
            letterSpacing: '-0.018em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: checked && !isAvoid ? 0.82 : 1,
          }}>
            {habit.name}
          </div>
          {checked && !isAvoid && (
            <span style={{
              flexShrink: 0,
              fontFamily: t.MONO,
              fontSize: 7,
              fontWeight: 900,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: '#07100d',
              background: accent,
              borderRadius: 999,
              padding: '3px 5px',
            }}>
              Done
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: t.MONO,
            fontSize: 7.5,
            fontWeight: 900,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: accent,
          }}>
            {isAvoid ? 'Avoid' : 'Daily'}
          </span>
          {habit.remindAt && (
            <span style={{
              fontFamily: t.MONO,
              fontSize: 7.5,
              color: muted,
              letterSpacing: '0.12em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {habit.remindAt}
            </span>
          )}
          {streak > 0 && (
            <span style={{
              fontFamily: t.MONO,
              fontSize: 7.5,
              color: '#d3a133',
              letterSpacing: '0.12em',
              fontWeight: 800,
            }}>
              {streak}d streak
            </span>
          )}
          {habit.visibility !== 'private' && (
            <span style={{
              fontFamily: t.MONO,
              fontSize: 7,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#07100d',
              background: '#d3a133',
              padding: '2px 6px',
              borderRadius: 999,
            }}>
              {habit.visibility === 'friends' ? 'Friends' : 'Public'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
          {week.map((date) => {
            const did = set.has(date);
            const isToday = date === _bsHabitsToday;
            return (
              <div key={date} style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
              }}>
                <div style={{
                  width: '100%',
                  height: 9,
                  background: did ? accent : 'transparent',
                  border: `1px solid ${isToday ? 'rgba(247,241,230,0.80)' : 'rgba(247,241,230,0.13)'}`,
                  borderRadius: 999,
                }} />
                <span style={{
                  fontFamily: t.MONO,
                  fontSize: 6.5,
                  letterSpacing: '0.1em',
                  color: isToday ? ink : muted,
                  fontWeight: isToday ? 800 : 500,
                }}>
                  {_bsDowLetter(date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onEdit(habit.id)}
        aria-label="Edit habit"
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          background: 'transparent',
          border: 0,
          fontFamily: t.MONO,
          fontSize: 14,
          color: 'rgba(247,241,230,0.42)',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        }}
      >
        ...
      </button>
    </div>
  );
}

function BSHabitGridCard({ habit, onToggle, onEdit }) {
  const t = useBS();
  const week = _bsLast7();
  const set = new Set(habit.history || []);
  const checked = set.has(_bsHabitsToday);
  const isAvoid = habit.type === 'avoid';
  const accent = isAvoid ? '#ff6a5c' : '#65b878';
  const darkPaper = '#f7f1e6';
  const darkMuted = 'rgba(247,241,230,0.50)';
  const streak = _bsStreakFromHistory(habit.history);

  return (
    <div style={{
      minHeight: 154,
      borderRadius: 10,
      border: `1px solid ${checked ? `${accent}88` : 'rgba(247,241,230,0.14)'}`,
      background: checked ? 'rgba(101,184,120,0.12)' : 'rgba(247,241,230,0.035)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      color: darkPaper,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <button
          onClick={() => onToggle(habit.id)}
          aria-label={checked ? 'Mark not done' : 'Mark done'}
          style={{
            width: 30,
            height: 30,
            flexShrink: 0,
            borderRadius: 7,
            border: `2px solid ${checked ? accent : darkPaper}`,
            background: checked ? accent : 'transparent',
            color: checked ? '#07100d' : darkPaper,
            fontFamily: t.MONO,
            fontWeight: 900,
            fontSize: 14,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {checked ? (isAvoid ? '×' : '✓') : ''}
        </button>
        <button
          onClick={() => onEdit(habit.id)}
          aria-label="Edit habit"
          style={{
            background: 'transparent',
            border: 0,
            color: darkMuted,
            fontFamily: t.MONO,
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          ⋯
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: t.DISPLAY,
          fontSize: 17,
          fontWeight: 650,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: darkPaper,
          textDecoration: checked && !isAvoid ? 'line-through' : 'none',
          textDecorationColor: darkMuted,
          opacity: checked && !isAvoid ? 0.64 : 1,
        }}>
          {habit.name}
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontFamily: t.MONO,
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: accent,
          }}>
            {isAvoid ? 'Avoid' : 'Daily'}
          </span>
          {streak > 0 && (
            <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 900, letterSpacing: '0.12em', color: '#d3a133' }}>
              {streak}d
            </span>
          )}
          {habit.visibility !== 'private' && (
            <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 900, letterSpacing: '0.14em', color: '#07100d', background: '#d3a133', padding: '2px 5px', textTransform: 'uppercase' }}>
              {habit.visibility === 'friends' ? 'Friends' : 'Public'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {week.map((date) => {
          const did = set.has(date);
          const isToday = date === _bsHabitsToday;
          return (
            <div key={date} style={{ display: 'grid', gap: 3, justifyItems: 'center' }}>
              <div style={{
                width: '100%',
                height: 13,
                borderRadius: 3,
                background: did ? accent : 'transparent',
                border: `1px solid ${isToday ? darkPaper : 'rgba(247,241,230,0.16)'}`,
              }} />
              <span style={{
                fontFamily: t.MONO,
                fontSize: 7,
                color: isToday ? darkPaper : darkMuted,
                fontWeight: isToday ? 900 : 600,
              }}>
                {_bsDowLetter(date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Inline form for creating / editing a habit
function BSHabitForm({ initial, onSave, onCancel, onDelete }) {
  const t = useBS();
  const [name, setName] = useStateBSH(initial?.name || '');
  const [type, setType] = useStateBSH(initial?.type || 'do');
  const [remindAt, setRemindAt] = useStateBSH(initial?.remindAt || '');
  const [visibility, setVisibility] = useStateBSH(initial?.visibility || (initial?.public ? 'public' : 'private'));
  const isEdit = !!initial;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      id: initial?.id || `h_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: trimmed.slice(0, 60),
      type, remindAt,
      visibility,
      public: visibility === 'public',
      history: initial?.history || [],
    });
  };

  return (
    <div style={{
      padding: '14px 0 4px', marginTop: 10,
      borderTop: `1px solid ${t.RULE}`,
    }}>
      <div style={{
        fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800,
        letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50,
        marginBottom: 6,
      }}>
        {isEdit ? 'Edit habit' : 'New habit'}
      </div>

      {/* Name */}
      <input
        type="text"
        placeholder="e.g. Drink 2L water"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        maxLength={60}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '10px 0', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 500,
          background: 'transparent', color: t.INK,
          border: 'none', borderBottom: `2px solid ${t.INK}`,
          outline: 'none', letterSpacing: '-0.01em',
        }}
      />

      {/* Type pills */}
      <div style={{
        display: 'flex', gap: 6, marginTop: 14,
      }}>
        {[
          { k: 'do', label: '✓ Do daily', color: t.GREEN },
          { k: 'avoid', label: '✕ Avoid', color: t.RUST },
        ].map(p => (
          <button
            key={p.k}
            onClick={() => setType(p.k)}
            style={{
              flex: 1, padding: '9px 10px',
              border: `2px solid ${t.INK}`,
              background: type === p.k ? p.color : 'transparent',
              color: type === p.k ? t.PAPER : t.INK,
              fontFamily: t.MONO, fontSize: 10, fontWeight: 800,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Reminder */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginTop: 14,
      }}>
        <div>
          <div style={{
            fontFamily: t.MONO, fontSize: 9, fontWeight: 800,
            letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50,
          }}>
            Reminder
          </div>
          <div style={{
            fontFamily: t.DISPLAY, fontSize: 13, color: t.INK, marginTop: 2,
          }}>
            {remindAt ? `Notify at ${remindAt}` : 'No notification'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BSTimeChip value={remindAt} onChange={setRemindAt} ink={t.INK} mono={t.MONO} />
          {remindAt && (
            <button
              onClick={() => setRemindAt('')}
              aria-label="Clear reminder"
              style={{
                background: 'transparent', border: `1px solid ${t.INK}`,
                fontFamily: t.MONO, fontSize: 11, color: t.INK,
                width: 28, height: 28, cursor: 'pointer', padding: 0,
                borderRadius: 6,
              }}
            >×</button>
          )}
        </div>
      </div>

      {/* Visibility — public habits notify Shape friends if you miss the day */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.RULE}`,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: t.MONO, fontSize: 9, fontWeight: 800,
            letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50,
          }}>
            Visibility
          </div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK, marginTop: 2 }}>
            {visibility === 'private'
              ? 'Private - only you'
              : visibility === 'friends'
                ? 'Friends only - shared with Shape friends'
                : 'Public - visible to the Shape community'}
          </div>
          {visibility !== 'private' && (
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.AMBER, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 6 }}>
              Friends can support streaks when you miss a day
            </div>
          )}
        </div>
        <div style={{ display: 'inline-flex', border: `1px solid ${t.INK}`, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
          {[
            { k: 'private', label: 'Private' },
            { k: 'friends', label: 'Friends' },
            { k: 'public',  label: 'Public'  },
          ].map((opt, i) => (
            <button
              key={String(opt.k)}
              onClick={() => setVisibility(opt.k)}
              style={{
                padding: '7px 9px',
                background: visibility === opt.k ? t.INK : 'transparent',
                color: visibility === opt.k ? t.PAPER : t.INK,
                border: 0, borderLeft: i > 0 ? `1px solid ${t.INK}` : 0,
                fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', gap: 8, marginTop: 16,
        paddingTop: 12, borderTop: `1px solid ${t.RULE}`,
      }}>
        {isEdit && (
          <button
            onClick={() => onDelete(initial.id)}
            style={{
              padding: '10px 14px', border: `1px solid ${t.RUST}`,
              background: 'transparent', color: t.RUST,
              fontFamily: t.MONO, fontSize: 10, fontWeight: 800,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: 'pointer',
              borderRadius: t.RADIUS_SM,
            }}
          >Delete</button>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={onCancel}
          style={{
            padding: '10px 14px', border: `1px solid ${t.INK}`,
            background: 'transparent', color: t.INK,
            fontFamily: t.MONO, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            cursor: 'pointer',
            borderRadius: t.RADIUS_SM,
          }}
        >Cancel</button>
        <button
          onClick={save}
          disabled={!name.trim()}
          style={{
            padding: '10px 18px', border: `2px solid ${t.INK}`,
            background: name.trim() ? t.INK : t.INK50, color: t.PAPER,
            fontFamily: t.MONO, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            cursor: name.trim() ? 'pointer' : 'default',
            borderRadius: t.RADIUS_SM,
          }}
        >{isEdit ? 'Save' : 'Add habit'}</button>
      </div>
    </div>
  );
}

// Main block — drop on any home page
function BSHabitTracker({ tweaks, setTweak, accent, mode = 'full', onOpen }) {
  const t = useBS();
  const habits = _bsDecodeHabits(tweaks.habits);
  const [editingId, setEditingId] = useStateBSH(null); // 'new' | habit.id | null

  const accentColor = accent || t.AMBER;
  const save = (next) => setTweak('habits', _bsEncodeHabits(next));

  const toggle = (id) => {
    save(habits.map(h => {
      if (h.id !== id) return h;
      const hist = new Set(h.history || []);
      if (hist.has(_bsHabitsToday)) hist.delete(_bsHabitsToday);
      else hist.add(_bsHabitsToday);
      return { ...h, history: [...hist].sort() };
    }));
  };

  const upsert = (h) => {
    const exists = habits.find(x => x.id === h.id);
    save(exists
      ? habits.map(x => x.id === h.id ? h : x)
      : [...habits, h]
    );
    setEditingId(null);
  };

  const remove = (id) => {
    save(habits.filter(h => h.id !== id));
    setEditingId(null);
  };

  const doneCount = habits.filter(h => (h.history || []).includes(_bsHabitsToday)).length;
  const editing = editingId === 'new'
    ? null
    : habits.find(h => h.id === editingId);
  const showForm = editingId !== null;

  // ── SUMMARY MODE ─────────────────────────────────────────────
  // Compact card for the home page — fixed footprint regardless of
  // habit count. Tap to open the dedicated habits page.
  if (mode === 'summary') {
    if (habits.length === 0) {
      return (
        <>
          <BSSection title="Habits" kicker="Start a streak" />
          <div style={{ padding: `0 ${t.padX}px 4px` }}>
            <button
              onClick={onOpen}
              style={{
                width: '100%', textAlign: 'left',
                padding: '14px 16px',
                border: `1px dashed ${t.INK}`, background: 'transparent',
                color: t.INK, cursor: 'pointer',
                borderRadius: t.RADIUS_SM,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}
            >
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.AMBER, fontWeight: 700 }}>Track a streak</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: t.W.display, marginTop: 4, letterSpacing: '-0.02em' }}>+ Add first habit</div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: t.ACCENT }}>OPEN →</span>
            </button>
          </div>
        </>
      );
    }
    // Render: compact daily checklist + route to the full habits page.
    const preview = habits.slice(0, 3);
    const more = Math.max(0, habits.length - preview.length);
    const checklistBg = t.PAPER2;
    const checklistInk = t.INK;
    const checklistMuted = t.INK70;
    const checklistRule = t.RULE;
    const doneRowBg = t.isLight ? 'rgba(47,107,58,0.10)' : 'rgba(95,177,110,0.10)';
    const avoidLabel = t.isLight ? t.RUST : '#ff8b7f';
    return (
      <>
        <BSSection title="Habits" meta={`${doneCount}/${habits.length} today`} />
        <div style={{ padding: `0 ${t.padX}px 4px` }}>
          <button
            onClick={onOpen}
            style={{
              width: '100%', textAlign: 'left',
              padding: 0, borderRadius: 8,
              border: `1px solid ${checklistRule}`,
              background: checklistBg,
              color: checklistInk,
              cursor: 'pointer',
              overflow: 'hidden',
              display: 'block',
            }}
          >
            <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${checklistRule}`, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start', gap: 12 }}>
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT }}>
                  Daily habits
                </div>
                <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: t.W.display, letterSpacing: '-0.035em', color: checklistInk }}>
                  {doneCount} of {habits.length} complete
                </div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 900, letterSpacing: '0.2em', color: t.ACCENT, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Open all →</span>
            </div>
            <div style={{ padding: '11px 14px 7px', display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, habits.length)}, minmax(0, 1fr))`, gap: 4 }}>
              {habits.map((h) => {
                const did = (h.history || []).includes(_bsHabitsToday);
                const isAvoid = h.type === 'avoid';
                return (
                  <span key={`seg_${h.id}`} style={{
                    height: 5,
                    borderRadius: 99,
                    background: did ? (isAvoid ? t.RUST : t.GREEN) : 'rgba(247,241,230,0.15)',
                  }} />
                );
              })}
            </div>
            <div style={{ padding: '2px 14px 13px', display: 'grid' }}>
              {preview.map(h => {
                const did = (h.history || []).includes(_bsHabitsToday);
                const isAvoid = h.type === 'avoid';
                const c = isAvoid ? t.RUST : t.GREEN;
                return (
                  <span key={h.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr auto',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 42,
                    padding: '8px 0',
                    background: did ? doneRowBg : 'transparent',
                    color: checklistInk,
                    borderTop: `1px solid ${checklistRule}`,
                  }}>
                    <span style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      display: 'grid',
                      placeItems: 'center',
                      background: did ? c : 'transparent',
                      border: `1px solid ${did ? c : checklistMuted}`,
                      color: did ? t.PAPER : checklistMuted,
                      fontFamily: t.MONO,
                      fontSize: 12,
                      fontWeight: 900,
                    }}>{did ? '✓' : (isAvoid ? '×' : '')}</span>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: did && !isAvoid ? 'line-through' : 'none', textDecorationColor: checklistMuted, opacity: did && !isAvoid ? 0.68 : 1 }}>{h.name}</span>
                    <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 900, letterSpacing: '0.18em', color: isAvoid ? avoidLabel : t.ACCENT, textTransform: 'uppercase' }}>{isAvoid ? "Don't" : 'Do'}</span>
                  </span>
                );
              })}
              {more > 0 && (
                <span style={{
                  padding: '7px 8px',
                  borderRadius: 7,
                  border: `1px dashed ${checklistRule}`,
                  color: checklistMuted,
                  fontFamily: t.MONO,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                }}>+{more} more</span>
              )}
            </div>
          </button>
        </div>
      </>
    );
  }

  // Empty state
  if (habits.length === 0 && !showForm) {
    return (
      <>
        <BSSection title="Habits" kicker="Start a streak" />
        <div style={{ padding: `0 ${t.padX}px 18px` }}>
          <div style={{ borderTop: `2px solid ${t.INK}`, paddingTop: 14 }}>
            <div style={{
              fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700,
              color: t.INK, lineHeight: 1.15, letterSpacing: '-0.02em',
              marginBottom: 8,
            }}>
              Track daily habits — or things to avoid.
            </div>
            <div style={{
              fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500,
              color: t.INK70, lineHeight: 1.45, marginBottom: 14,
            }}>
              Set a reminder, check it off each day. Every habit adds to your <span style={{ color: t.AMBER, fontWeight: 700 }}>Shape Score</span> — longer streaks compound for bigger gains.
            </div>
            <button
              onClick={() => setEditingId('new')}
              style={{
                padding: '11px 18px', border: `2px solid ${t.INK}`,
                background: t.INK, color: t.PAPER,
                fontFamily: t.MONO, fontSize: 10, fontWeight: 800,
                letterSpacing: '0.22em', textTransform: 'uppercase',
                cursor: 'pointer',
                borderRadius: t.RADIUS_SM,
              }}
            >+ Add first habit</button>
          </div>
        </div>
      </>
    );
  }

  const progressPct = habits.length ? Math.round((doneCount / habits.length) * 100) : 0;
  const sharedCount = habits.filter(h => h.visibility !== 'private').length;

  return (
    <>
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{
          background: 'linear-gradient(180deg, rgba(247,241,230,0.06), rgba(247,241,230,0.02)), #0b0a08',
          color: '#f7f1e6',
          borderRadius: 18,
          padding: 14,
          border: '1px solid rgba(247,241,230,0.14)',
          boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            paddingBottom: 12,
          }}>
            <span style={{
              fontFamily: t.DISPLAY,
              fontWeight: 700,
              fontSize: 21,
              letterSpacing: '-0.025em',
              color: '#f7f1e6',
            }}>Habits</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{
                fontFamily: t.MONO,
                fontSize: 8.5,
                color: '#07100d',
                background: '#f7f1e6',
                borderRadius: 999,
                padding: '6px 9px',
                letterSpacing: '0.13em',
                textTransform: 'uppercase',
                fontWeight: 900,
              }}>
                {doneCount}/{habits.length} today
              </span>
              {!showForm && (
                <button
                  onClick={() => setEditingId('new')}
                  aria-label="Add habit"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: '1px solid rgba(247,241,230,0.28)',
                    background: 'rgba(247,241,230,0.08)',
                    color: '#f7f1e6',
                    fontFamily: t.MONO,
                    fontSize: 18,
                    fontWeight: 900,
                    lineHeight: 1,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  +
                </button>
              )}
            </div>
          </div>

          <div style={{
            borderTop: '1px solid rgba(247,241,230,0.18)',
            paddingTop: 14,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            alignItems: 'center',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: t.DISPLAY,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: '#f7f1e6',
              }}>
                Daily checklist
              </div>
              <div style={{
                marginTop: 4,
                fontFamily: t.DISPLAY,
                fontSize: 12,
                lineHeight: 1.35,
                color: 'rgba(247,241,230,0.62)',
              }}>
                {doneCount} done today. {sharedCount} shared with friends or public.
              </div>
              <div style={{
                marginTop: 10,
                height: 8,
                borderRadius: 999,
                background: 'rgba(247,241,230,0.14)',
                overflow: 'hidden',
                border: '1px solid rgba(247,241,230,0.12)',
              }}>
                <div style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: '#65b878',
                }} />
              </div>
            </div>
            <div style={{
              textAlign: 'right',
              fontFamily: t.MONO,
              fontSize: 8.5,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#17c8b2',
              lineHeight: 1.45,
              whiteSpace: 'nowrap',
            }}>
              {habits.length} total<br />
              {sharedCount} shared
            </div>
          </div>

          <div style={{ display: 'grid', gap: 0, marginTop: 8 }}>
            {habits.map((h, i) => (
              <BSHabitRow
                key={h.id}
                habit={h}
                onToggle={toggle}
                onEdit={(id) => setEditingId(id)}
                last={i === habits.length - 1 && !showForm}
              />
            ))}
          </div>

          {showForm && (
            <BSHabitForm
              initial={editing}
              onSave={upsert}
              onCancel={() => setEditingId(null)}
              onDelete={remove}
            />
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{
          background: '#0b0a08',
          color: '#f7f1e6',
          borderRadius: 10,
          padding: '14px 14px 16px',
          border: '1px solid rgba(247,241,230,0.10)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 10,
            paddingBottom: 8,
          }}>
            <span style={{
              fontFamily: t.DISPLAY,
              fontWeight: t.W.displayHeavy,
              fontSize: 11,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: '#f7f1e6',
            }}>▍ Habits</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {habits.length > 0 && (
                <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: 'rgba(247,241,230,0.58)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  {doneCount}/{habits.length} today
                </span>
              )}
              {!showForm && (
                <button
                  onClick={() => setEditingId('new')}
                  aria-label="Add habit"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    border: '1px solid rgba(247,241,230,0.74)',
                    background: 'transparent',
                    color: '#f7f1e6',
                    fontFamily: t.MONO,
                    fontSize: 18,
                    fontWeight: 900,
                    lineHeight: 1,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  +
                </button>
              )}
            </div>
          </div>
          <div style={{
            borderTop: '2px solid #f7f1e6',
            paddingTop: 12,
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'end',
              gap: 12,
              padding: '0 0 12px',
              borderBottom: '1px solid rgba(247,241,230,0.14)',
            }}>
              <div style={{
                fontFamily: t.DISPLAY,
                fontSize: 42,
                lineHeight: 0.9,
                letterSpacing: '-0.05em',
                fontWeight: t.W.display,
                color: '#f7f1e6',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {doneCount}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: t.MONO,
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#17c8b2',
                }}>
                  Daily checklist
                </div>
                <div style={{
                  marginTop: 7,
                  height: 7,
                  borderRadius: 999,
                  background: 'rgba(247,241,230,0.14)',
                  overflow: 'hidden',
                  border: '1px solid rgba(247,241,230,0.12)',
                }}>
                  <div style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: '#65b878',
                  }} />
                </div>
              </div>
              <div style={{
                textAlign: 'right',
                fontFamily: t.MONO,
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(247,241,230,0.54)',
                lineHeight: 1.5,
                whiteSpace: 'nowrap',
              }}>
                {habits.length} total<br />
                {sharedCount} shared
              </div>
            </div>

            <div style={{
              display: 'grid',
              gap: 0,
            }}>
              {habits.map((h, i) => (
                <BSHabitRow
                  key={h.id}
                  habit={h}
                  onToggle={toggle}
                  onEdit={(id) => setEditingId(id)}
                  last={i === habits.length - 1 && !showForm}
                />
              ))}
            </div>
          </div>

        {showForm && (
          <BSHabitForm
            initial={editing}
            onSave={upsert}
            onCancel={() => setEditingId(null)}
            onDelete={remove}
          />
        )}
        </div>
      </div>
    </>
  );
}

// ─── DEDICATED HABITS PAGE ───────────────────────────────────
// A full-screen page for managing all habits. Linked-to from the
// summary card on home pages so the home doesn't grow with habit count.
function BSHabitsPage({ onBack, onOpenScore, tweaks, setTweak, accent }) {
  const t = useBS();
  const { BSPage, BSDetailHeader } = window;
  const habits = _bsDecodeHabits(tweaks.habits);
  const doneCount = habits.filter(h => (h.history || []).includes(_bsHabitsToday)).length;
  const sharedCount = habits.filter(h => h.visibility !== 'private').length;
  const publicCount = habits.filter(h => h.visibility === 'public').length;
  const friendsCount = habits.filter(h => h.visibility === 'friends').length;
  const missedTodayShared = habits.filter(h => h.visibility !== 'private' && h.type === 'do' && !(h.history || []).includes(_bsHabitsToday));
  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Section · Habits"
        title={<>Habits</>}
      />
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <BSHabitInsights habits={habits} accent={accent} onOpenScore={onOpenScore} />
      </div>
      <div style={{ marginTop: 12 }}>
        <BSHabitTracker tweaks={tweaks} setTweak={setTweak} accent={accent} mode="full" />
      </div>
    </BSPage>
  );

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Section · Daily ledger"
        title={<>Habits<br/>& streaks.</>}
      />
      <div style={{ marginTop: 12 }}>
        <BSHabitTracker tweaks={tweaks} setTweak={setTweak} accent={accent} mode="full" />
      </div>
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <BSHabitInsights habits={habits} accent={accent} onOpenScore={onOpenScore} />

        <div style={{ marginTop: 12, borderRadius: 10, border: '1px solid rgba(247,241,230,0.12)', background: '#1a1713', color: '#f7f1e6', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            ['Today',   `${doneCount}/${habits.length}`],
            ['Tracked', String(habits.length)],
            ['Shared',  String(sharedCount)],
          ].map(([l, v], i) => (
            <div key={l} style={{ borderLeft: i > 0 ? '1px solid rgba(247,241,230,0.10)' : 0, paddingLeft: i > 0 ? 12 : 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: 'rgba(247,241,230,0.52)', textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 26, color: '#f7f1e6', marginTop: 4, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Public-habits accountability explainer */}
        <div style={{ marginTop: 12, borderRadius: 10, border: '1px solid rgba(247,241,230,0.12)', background: '#1a1713', color: '#f7f1e6', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 16, lineHeight: 1, marginTop: 1 }}>⚡</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#10c8b1' }}>
              Public accountability
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.4, marginTop: 4 }}>
              {sharedCount === 0
                ? 'Keep habits private, share with friends only, or make them public. Privacy is the default.'
                : missedTodayShared.length === 0
                  ? `${sharedCount} shared ${sharedCount === 1 ? 'habit' : 'habits'} - ${friendsCount} friends-only, ${publicCount} public.`
                  : `${missedTodayShared.length} shared ${missedTodayShared.length === 1 ? 'habit' : 'habits'} not done today. Friends can support the streak.`}
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#10c8b1', marginTop: 8 }}>
              + Every completed habit adds to your Shape score
            </div>
          </div>
        </div>
      </div>
    </BSPage>
  );
}

Object.assign(window, { BSHabitTracker, BSHabitsPage });
