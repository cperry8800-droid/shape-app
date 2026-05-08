import { useMemo, useState, type CSSProperties } from 'react';

type Habit = {
  id: string;
  label: string;
  mode: 'daily' | 'avoid';
  tag: string;
  streak?: string;
  done: boolean;
  days: boolean[];
};

const initialHabits: Habit[] = [
  {
    id: 'water',
    label: 'Drink 3 L water',
    mode: 'daily',
    tag: 'Water',
    streak: '1d streak',
    done: true,
    days: [true, false, true, true, true, false, true],
  },
  {
    id: 'vitamins',
    label: 'Take vitamins',
    mode: 'daily',
    tag: 'Daily',
    done: false,
    days: [false, true, false, true, false, true, false],
  },
  {
    id: 'smoking',
    label: 'No smoking',
    mode: 'avoid',
    tag: 'Avoid',
    done: false,
    days: [true, true, false, true, true, true, false],
  },
];

const dayLabels = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'];

const gridRows = [
  { mode: 'do', label: 'Sleep 7+ hrs', days: [true, true, false, true, true, true, true] },
  { mode: 'do', label: '10,000 steps', days: [true, true, true, true, false, true, true] },
  { mode: 'do', label: '3 L water', days: [true, false, true, true, true, false, true] },
  { mode: 'do', label: 'Protein meals', days: [true, true, true, false, true, true, true] },
  { mode: "don't", label: 'No alcohol', days: [true, true, true, true, true, true, true] },
  { mode: "don't", label: 'No skipped', days: [true, true, false, true, true, true, true] },
];

export function HabitsPanel({ context = 'client' }: { context?: 'client' | 'trainer' | 'nutritionist' }) {
  const [habits, setHabits] = useState(initialHabits);
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');

  const doneCount = useMemo(() => habits.filter((habit) => habit.done).length, [habits]);
  const sharedCount = visibility === 'private' ? 0 : doneCount;
  const gridDone = useMemo(
    () => gridRows.reduce((sum, row) => sum + row.days.filter(Boolean).length, 0),
    []
  );
  const gridTotal = gridRows.length * dayLabels.length;
  const adherence = Math.round((gridDone / gridTotal) * 100);
  const scoreFromHabits = 156 + doneCount * 4;

  function toggleHabit(id: string) {
    setHabits((current) =>
      current.map((habit) =>
        habit.id === id
          ? { ...habit, done: !habit.done, days: habit.days.map((day, index) => (index === 6 ? !habit.done : day)) }
          : habit
      )
    );
  }

  function addHabit() {
    const label = window.prompt('New habit');
    if (!label?.trim()) return;
    setHabits((current) => [
      ...current,
      {
        id: `habit-${Date.now()}`,
        label: label.trim(),
        mode: 'daily',
        tag: 'Custom',
        done: false,
        days: [false, false, false, false, false, false, false],
      },
    ]);
  }

  return (
    <section style={panelStyle} aria-label="Habits">
      <header style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Section &middot; Habits</div>
          <h2 style={titleStyle}>Habits</h2>
          <div style={subtleStyle}>{context === 'client' ? 'Friends only · daily tracking' : `${context} checklist`}</div>
        </div>
        <div style={statusStyle}>LTE 92%</div>
      </header>

      <section style={scoreCardStyle}>
        <div>
          <div style={eyebrowStyle}>Shape score &middot; from habits</div>
          <div style={scoreStyle}>+{scoreFromHabits}</div>
          <div style={summaryCopyStyle}>Earned from habits this week.</div>
        </div>
        <div style={adherenceStyle}>
          <strong>{adherence}%</strong>
          <span>Adherence</span>
        </div>
      </section>

      <section style={gridCardStyle}>
        <div style={sectionHeaderStyle}>
          <span>Grid</span>
          <span>Last 7 days</span>
        </div>
        <div style={weekHeaderStyle}>
          <span />
          {dayLabels.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {gridRows.map((row) => (
            <div key={row.label} style={heatRowStyle}>
              <div style={heatLabelStyle}>
                <span style={{ color: row.mode === "don't" ? '#ff6b5c' : 'var(--teal-bright)' }}>{row.mode}</span>
                <strong>{row.label}</strong>
              </div>
              <div style={heatDotsStyle}>
                {row.days.map((done, index) => (
                  <span key={`${row.label}-${index}`} style={{ ...heatDotStyle, ...(done ? heatDotDoneStyle : null) }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={controlsCardStyle}>
        <div style={sectionHeaderStyle}>
          <span>Habits</span>
          <span>{doneCount}/{habits.length} today</span>
        </div>
        <div style={visibilityStyle} aria-label="Habit visibility">
          {(['public', 'friends', 'private'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setVisibility(option)}
              style={{
                ...visibilityButtonStyle,
                ...(visibility === option ? visibilityButtonActiveStyle : null),
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <div style={progressTrackStyle}>
          <div style={{ ...progressFillStyle, width: `${Math.max(8, (doneCount / Math.max(habits.length, 1)) * 100)}%` }} />
        </div>

        <div style={habitGridStyle}>
          {habits.map((habit) => (
            <article key={habit.id} style={{ ...habitCardStyle, ...(habit.done ? habitCardDoneStyle : null) }}>
              <div style={habitTopStyle}>
                <button
                  type="button"
                  onClick={() => toggleHabit(habit.id)}
                  aria-label={`Log ${habit.label}`}
                  style={{ ...checkStyle, ...(habit.done ? checkDoneStyle : null) }}
                >
                  {habit.done ? '✓' : ''}
                </button>
                <button type="button" aria-label="Habit options" style={moreStyle}>...</button>
              </div>
              <div style={habitMetaStyle}>
                <span style={{ color: habit.mode === 'avoid' ? '#ff6b5c' : 'var(--teal-bright)' }}>{habit.tag}</span>
                {habit.streak && <span style={{ color: '#d99b22' }}>{habit.streak}</span>}
              </div>
              <div style={habitNameStyle}>{habit.label}</div>
              <button type="button" onClick={() => toggleHabit(habit.id)} style={logButtonStyle}>
                {habit.done ? 'Logged' : 'Log now'}
              </button>
            </article>
          ))}
          <button type="button" onClick={addHabit} style={addHabitCardStyle}>+ Add habit</button>
        </div>

        <div style={sharedNoteStyle}>{sharedCount} shared with friends or public.</div>
      </section>
    </section>
  );
}

const mono = "'JetBrains Mono', monospace";
const display = 'Fraunces, serif';

const panelStyle: CSSProperties = {
  display: 'grid',
  gap: 14,
  paddingBottom: 18,
};

const heroStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  padding: '10px 2px 0',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: display,
  fontSize: 42,
  fontWeight: 500,
  lineHeight: 0.95,
  letterSpacing: '-0.03em',
};

const eyebrowStyle: CSSProperties = {
  fontFamily: mono,
  color: 'var(--teal-bright)',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  marginBottom: 7,
};

const subtleStyle: CSSProperties = {
  marginTop: 6,
  color: 'var(--muted)',
  fontFamily: mono,
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const statusStyle: CSSProperties = {
  color: 'var(--muted-2)',
  fontFamily: mono,
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const scoreCardStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'center',
  padding: 18,
  borderRadius: 18,
  border: '1px solid rgba(46,224,196,0.42)',
  background: 'linear-gradient(135deg, rgba(14,92,74,0.55), rgba(15,35,27,0.85))',
  boxShadow: '0 18px 46px rgba(0,0,0,0.24)',
};

const scoreStyle: CSSProperties = {
  color: 'var(--teal-bright)',
  fontFamily: display,
  fontSize: 56,
  lineHeight: 0.9,
  marginBottom: 12,
};

const adherenceStyle: CSSProperties = {
  display: 'grid',
  gap: 3,
  textAlign: 'right',
  color: 'var(--ink)',
};

const gridCardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 18,
  background: 'rgba(242,237,228,0.055)',
  border: '1px solid rgba(242,237,228,0.1)',
};

const controlsCardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(242,237,228,0.055), rgba(242,237,228,0.025))',
  border: '1px solid rgba(242,237,228,0.1)',
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  marginBottom: 14,
  fontFamily: mono,
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
};

const weekHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(118px, 1fr) repeat(7, 18px)',
  gap: 8,
  color: 'var(--muted-2)',
  fontFamily: mono,
  fontSize: 8,
  letterSpacing: '0.08em',
  textAlign: 'center',
  textTransform: 'uppercase',
  marginBottom: 10,
};

const heatRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(118px, 1fr) auto',
  gap: 8,
  alignItems: 'center',
};

const heatLabelStyle: CSSProperties = {
  display: 'grid',
  gap: 2,
  minWidth: 0,
  fontSize: 12,
};

const heatDotsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 18px)',
  gap: 8,
};

const heatDotStyle: CSSProperties = {
  width: 18,
  height: 12,
  borderRadius: 999,
  background: 'rgba(242,237,228,0.1)',
  border: '1px solid rgba(242,237,228,0.08)',
};

const heatDotDoneStyle: CSSProperties = {
  background: 'var(--teal)',
  borderColor: 'var(--teal)',
};

const visibilityStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
  marginBottom: 12,
};

const visibilityButtonStyle: CSSProperties = {
  padding: '10px 6px',
  borderRadius: 999,
  border: '1px solid rgba(242,237,228,0.16)',
  background: 'rgba(242,237,228,0.035)',
  color: 'var(--muted)',
  fontFamily: mono,
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const visibilityButtonActiveStyle: CSSProperties = {
  background: 'var(--teal)',
  color: '#06110f',
  borderColor: 'var(--teal)',
};

const progressTrackStyle: CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: 'rgba(242,237,228,0.18)',
  overflow: 'hidden',
  margin: '0 0 14px',
};

const progressFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg, #64c878, #1ec0a8)',
};

const habitGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
};

const habitCardStyle: CSSProperties = {
  minHeight: 134,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 14,
  borderRadius: 16,
  border: '1px solid rgba(242,237,228,0.12)',
  background: 'linear-gradient(180deg, rgba(242,237,228,0.05), rgba(242,237,228,0.02))',
};

const habitCardDoneStyle: CSSProperties = {
  borderColor: 'rgba(46,224,196,0.5)',
  background: 'linear-gradient(180deg, rgba(20,89,51,0.78), rgba(14,41,26,0.66))',
};

const habitTopStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
};

const checkStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  border: '2px solid rgba(242,237,228,0.9)',
  background: 'transparent',
  color: 'var(--ink)',
  fontSize: 16,
  lineHeight: 1,
};

const checkDoneStyle: CSSProperties = {
  borderColor: '#6bd27e',
  background: '#6bd27e',
  color: '#06110f',
};

const moreStyle: CSSProperties = {
  border: 0,
  background: 'rgba(242,237,228,0.08)',
  color: 'var(--muted)',
  borderRadius: 9,
  width: 32,
  height: 32,
  letterSpacing: 1,
};

const habitMetaStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  fontFamily: mono,
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

const habitNameStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.2,
};

const logButtonStyle: CSSProperties = {
  marginTop: 'auto',
  width: '100%',
  padding: '9px 10px',
  borderRadius: 999,
  border: '1px solid rgba(242,237,228,0.18)',
  background: 'rgba(242,237,228,0.06)',
  color: 'var(--ink)',
  fontFamily: mono,
  fontSize: 9,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};

const addHabitCardStyle: CSSProperties = {
  minHeight: 134,
  borderRadius: 16,
  border: '1px dashed rgba(242,237,228,0.28)',
  background: 'transparent',
  color: 'var(--ink)',
  fontFamily: mono,
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};

const summaryCopyStyle: CSSProperties = {
  color: 'var(--muted)',
  fontSize: 13,
  lineHeight: 1.35,
};

const sharedNoteStyle: CSSProperties = {
  marginTop: 12,
  color: 'var(--muted)',
  fontSize: 8,
  fontFamily: mono,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};
