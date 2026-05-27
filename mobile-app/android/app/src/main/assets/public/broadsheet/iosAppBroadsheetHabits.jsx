// ─── HABIT TRACKER ──────────────────────────────────────────
// A user-curated list of "Do daily" / "Don't do" items with optional
// reminder times. Renders on Client + Trainer + Nutritionist home.
//
// Persistence: tweaks.habits — JSON-encoded array of:
//   { id, name, type: 'do' | 'avoid', remindAt: 'HH:MM' | '',
//     history: ['YYYY-MM-DD', ...]  // dates this habit was completed
//   }
//
// Today's date is held internally as Apr 21 2026 to match the rest of the app.

const { useState: useStateBSH } = React;

const _bsHabitsToday = '2026-04-21';

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
// Letter for the day of week — Apr 21, 2026 is a Tuesday. Hard-coded ring matches.
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
      return {
        id: h.id || `h${i}_${Date.now()}`,
        name: String(h.name || '').slice(0, 60),
        type: h.type === 'avoid' ? 'avoid' : 'do',
        remindAt: typeof h.remindAt === 'string' ? h.remindAt : '',
        public: !!h.public,
        history,
      };
    });
  } catch (e) { return []; }
}
function _bsEncodeHabits(arr) {
  return JSON.stringify(arr.map(h => ({
    id: h.id, name: h.name, type: h.type,
    remindAt: h.remindAt || '',
    public: !!h.public,
    history: h.history || [],
  })));
}

// Small chrome-less time picker — opens native time input on tap
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
function BSHabitRow({ habit, onToggle, onEdit, last }) {
  const t = useBS();
  const week = _bsLast7();
  const set = new Set(habit.history || []);
  const checked = set.has(_bsHabitsToday);
  const isAvoid = habit.type === 'avoid';
  const accent = isAvoid ? t.RUST : t.GREEN;
  const streak = _bsStreakFromHistory(habit.history);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 0',
      borderBottom: last ? 'none' : `1px solid ${t.RULE}`,
    }}>
      {/* Check / cross box */}
      <button
        onClick={() => onToggle(habit.id)}
        aria-label={checked ? 'Mark not done' : 'Mark done'}
        style={{
          width: 28, height: 28, flexShrink: 0, marginTop: 2,
          border: `2px solid ${t.INK}`,
          background: checked ? accent : 'transparent',
          color: checked ? t.PAPER : t.INK,
          fontFamily: t.MONO, fontWeight: 800, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
          borderRadius: t.RADIUS_SM,
          transition: 'background 120ms',
        }}
      >
        {checked ? (isAvoid ? '×' : '✓') : ''}
      </button>

      {/* Name + meta + 7-day strip */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 15,
          color: t.INK, letterSpacing: '-0.01em',
          textDecoration: checked && !isAvoid ? 'line-through' : 'none',
          textDecorationColor: t.INK50,
          opacity: checked && !isAvoid ? 0.55 : 1,
        }}>
          {habit.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          <span style={{
            fontFamily: t.MONO, fontSize: 9, fontWeight: 800,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: isAvoid ? t.RUST : t.GREEN,
          }}>
            {isAvoid ? '✕ Avoid' : '✓ Daily'}
          </span>
          {habit.remindAt && (
            <span style={{
              fontFamily: t.MONO, fontSize: 9.5, color: t.INK50,
              letterSpacing: '0.12em', fontVariantNumeric: 'tabular-nums',
            }}>
              ◷ {habit.remindAt}
            </span>
          )}
          {streak > 0 && (
            <span style={{
              fontFamily: t.MONO, fontSize: 9.5, color: t.AMBER,
              letterSpacing: '0.12em', fontWeight: 700,
            }}>
              {streak}d streak
            </span>
          )}
          {habit.public && (
            <span style={{
              fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800,
              letterSpacing: '0.2em', textTransform: 'uppercase',
              color: t.PAPER, background: t.AMBER,
              padding: '1px 6px',
            }}>
              ⚡ Public
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
                  border: `1px solid ${isToday ? t.INK : t.HAIR}`,
                  borderRadius: 2,
                }} />
                <span style={{
                  fontFamily: t.MONO, fontSize: 7.5,
                  letterSpacing: '0.1em',
                  color: isToday ? t.INK : t.INK50,
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
          fontFamily: t.MONO, fontSize: 18, color: t.INK50,
          cursor: 'pointer', padding: 4, lineHeight: 1, marginTop: 2,
        }}
      >
        ⋯
      </button>
    </div>
  );
}

// Inline form for creating / editing a habit
function BSHabitForm({ initial, onSave, onCancel, onDelete }) {
  const t = useBS();
  const [name, setName] = useStateBSH(initial?.name || '');
  const [type, setType] = useStateBSH(initial?.type || 'do');
  const [remindAt, setRemindAt] = useStateBSH(initial?.remindAt || '');
  const [isPublic, setIsPublic] = useStateBSH(!!initial?.public);
  const isEdit = !!initial;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      id: initial?.id || `h_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: trimmed.slice(0, 60),
      type, remindAt,
      public: isPublic,
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
            {isPublic ? 'Public — friends on Shape can see this habit' : 'Private — only you'}
          </div>
          {isPublic && (
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.AMBER, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 6 }}>
              ⚡ Friends get notified if you miss a day
            </div>
          )}
        </div>
        {/* Segmented Public / Private switch */}
        <div style={{ display: 'inline-flex', border: `1px solid ${t.INK}`, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
          {[
            { k: false, label: 'Private' },
            { k: true,  label: 'Public'  },
          ].map((opt, i) => (
            <button
              key={String(opt.k)}
              onClick={() => setIsPublic(opt.k)}
              style={{
                padding: '7px 12px',
                background: isPublic === opt.k ? t.INK : 'transparent',
                color: isPublic === opt.k ? t.PAPER : t.INK,
                border: 0, borderLeft: i > 0 ? `1px solid ${t.INK}` : 0,
                fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
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
    // Render: progress chip + top 3 habits as small chips, then "Open all"
    const preview = habits.slice(0, 3);
    const more = Math.max(0, habits.length - preview.length);
    return (
      <>
        <BSSection title="Habits" meta={`${doneCount}/${habits.length} today`} />
        <div style={{ padding: `0 ${t.padX}px 4px` }}>
          <button
            onClick={onOpen}
            style={{
              width: '100%', textAlign: 'left',
              padding: '14px 16px', borderRadius: t.RADIUS_SM,
              border: `1px solid ${t.INK}`, background: t.PAPER2, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 32, fontWeight: t.W.display, letterSpacing: '-0.04em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{doneCount}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, letterSpacing: '0.16em', fontWeight: 700 }}>/ {habits.length} TODAY</span>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', color: t.ACCENT, textTransform: 'uppercase' }}>Open all →</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {preview.map(h => {
                const did = (h.history || []).includes(_bsHabitsToday);
                const isAvoid = h.type === 'avoid';
                const c = isAvoid ? t.RUST : t.GREEN;
                return (
                  <span key={h.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 9px', borderRadius: t.RADIUS_SM,
                    background: did ? c : 'transparent',
                    color: did ? t.PAPER : t.INK,
                    border: did ? 0 : `1px solid ${t.RULE}`,
                    fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                    maxWidth: '100%',
                  }}>
                    <span style={{ fontSize: 9 }}>{isAvoid ? '✕' : '✓'}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{h.name}</span>
                  </span>
                );
              })}
              {more > 0 && (
                <span style={{
                  padding: '5px 9px', borderRadius: t.RADIUS_SM,
                  border: `1px solid ${t.RULE}`, color: t.INK70,
                  fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
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

  return (
    <>
      <BSSection
        title="Habits"
        meta={habits.length > 0 ? `${doneCount}/${habits.length} today` : ''}
      />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {habits.map((h, i) => (
            <BSHabitRow
              key={h.id}
              habit={h}
              onToggle={toggle}
              onEdit={(id) => setEditingId(id)}
              last={i === habits.length - 1}
            />
          ))}
        </div>

        {showForm ? (
          <BSHabitForm
            initial={editing}
            onSave={upsert}
            onCancel={() => setEditingId(null)}
            onDelete={remove}
          />
        ) : (
          <button
            onClick={() => setEditingId('new')}
            style={{
              width: '100%', marginTop: 10,
              padding: '12px 14px',
              border: `1px dashed ${t.INK}`, background: 'transparent',
              color: t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800,
              letterSpacing: '0.22em', textTransform: 'uppercase',
              cursor: 'pointer',
              borderRadius: t.RADIUS,
            }}
          >+ Add habit</button>
        )}
      </div>
    </>
  );
}

// ─── DEDICATED HABITS PAGE ───────────────────────────────────
// A full-screen page for managing all habits. Linked-to from the
// summary card on home pages so the home doesn't grow with habit count.
function BSHabitsPage({ onBack, tweaks, setTweak, accent }) {
  const t = useBS();
  const { BSPage, BSDetailHeader } = window;
  const habits = _bsDecodeHabits(tweaks.habits);
  const doneCount = habits.filter(h => (h.history || []).includes(_bsHabitsToday)).length;
  const publicCount = habits.filter(h => h.public).length;
  const missedTodayPublic = habits.filter(h => h.public && h.type === 'do' && !(h.history || []).includes(_bsHabitsToday));
  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Section · Daily ledger"
        title={<>Habits<br/>& streaks.</>}
      />
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.INK}`, background: t.PAPER2, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            ['Today',   `${doneCount}/${habits.length}`],
            ['Tracked', String(habits.length)],
            ['Public',  String(publicCount)],
          ].map(([l, v], i) => (
            <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 12 : 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 26, color: t.INK, marginTop: 4, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Public-habits accountability explainer */}
        <div style={{ marginTop: 12, borderRadius: t.RADIUS_SM, border: `1px solid ${t.INK}`, background: t.INK, color: t.PAPER, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 16, lineHeight: 1, marginTop: 1 }}>⚡</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.AMBER }}>
              Public accountability
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.4, marginTop: 4 }}>
              {publicCount === 0
                ? 'Mark a habit Public and friends on Shape will be notified the days you miss it. Privacy is the default.'
                : missedTodayPublic.length === 0
                  ? `${publicCount} public ${publicCount === 1 ? 'habit' : 'habits'} \u2014 friends only get notified on days you miss.`
                  : `${missedTodayPublic.length} public ${missedTodayPublic.length === 1 ? 'habit' : 'habits'} not done today. Friends will be notified at midnight.`}
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.AMBER, marginTop: 8 }}>
              + Every completed habit adds to your Shape score
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <BSHabitTracker tweaks={tweaks} setTweak={setTweak} accent={accent} mode="full" />
      </div>
    </BSPage>
  );
}

Object.assign(window, { BSHabitTracker, BSHabitsPage });
