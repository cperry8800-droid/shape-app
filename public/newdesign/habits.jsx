// Shared habit-tracker primitives.
// Loaded by ClientHabits.html (full page) and ClientDashboard.html
// (compact widget on the Today dashboard). PAPER / INK / TEAL / TEAL_BRIGHT
// + sans/serif come from pageShell.jsx, which must be loaded first.

// A reusable checkbox sized for habit rows. Circle for "do" habits,
// rounded square for "don't" habits. Fills teal with a ✓ when checked.
function HabitCheckbox({ checked, onClick, type = "do", size = 26, ariaLabel }) {
  const square = type === "dont";
  return (
    <button onClick={onClick} aria-label={ariaLabel} aria-pressed={checked}
      style={{
        width: size, height: size, borderRadius: square ? 6 : 999, padding: 0, cursor: "pointer",
        background: checked ? TEAL : "transparent",
        border: checked ? `1px solid ${TEAL}` : "1px solid rgba(242,237,228,0.25)",
        color: PAPER, fontSize: Math.round(size * 0.55), lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, border-color 0.15s", flex: "none",
      }}>
      {checked ? "✓" : ""}
    </button>
  );
}

// Seed list shared between the dashboard widget and the full Habits page.
// Each habit: id, type ("do" | "dont"), label, sub, points (Shape Score per
// completion), history (oldest -> newest, 6 booleans), today (boolean).
const DEFAULT_HABITS = [
  { id: "sleep",    type: "do",   label: "Sleep 7+ hours",        sub: "Whoop or manual log",         points: 4, history: [true, true, false, true, true, true],  today: true  },
  { id: "steps",    type: "do",   label: "10,000 steps",          sub: "Anything counts",             points: 3, history: [true, true, true, true, false, true],  today: true  },
  { id: "water",    type: "do",   label: "3 L water",             sub: "Bottle on the desk",          points: 2, history: [true, false, true, true, true, false], today: false },
  { id: "protein",  type: "do",   label: "Protein at every meal", sub: "≥30g per main meal",          points: 4, history: [true, true, true, false, true, true],  today: true  },
  { id: "mobility", type: "do",   label: "10 min mobility",       sub: "Hips + shoulders, evening",   points: 3, history: [false, true, false, true, false, true], today: false },
  { id: "alcohol",  type: "dont", label: "No alcohol",            sub: "Weekend exceptions on you",   points: 5, history: [true, true, true, true, true, true],  today: true  },
  { id: "screens",  type: "dont", label: "No screens past 10 PM", sub: "Helps the sleep score",       points: 3, history: [false, true, true, false, true, true], today: false },
  { id: "soda",     type: "dont", label: "No soda or sugary drinks", sub: "Sparkling water counts",   points: 2, history: [true, true, true, true, true, true],  today: true  },
  { id: "skipped",  type: "dont", label: "No skipped meals",      sub: "Missing breakfast adds up",   points: 2, history: [true, true, false, true, true, true],  today: true  },
];

function habitStreak(h) {
  if (!h.today) return 0;
  let s = 1;
  for (let i = h.history.length - 1; i >= 0; i--) {
    if (h.history[i]) s++;
    else break;
  }
  return s;
}

// Compact widget for the Today dashboard. Shows up to `max` habits with
// inline checkboxes, a today-progress + Shape Score summary, and a link
// to the full Habits page. State is local to the widget — refreshing
// resets it (mock, no Supabase yet).
function HabitsWidget({ max = 5, items }) {
  const seed = (items || DEFAULT_HABITS).slice(0, max);
  const [habits, setHabits] = React.useState(seed);
  const toggle = (id) => setHabits(hs => hs.map(h => h.id === id ? { ...h, today: !h.today } : h));

  const doneCount = habits.filter(h => h.today).length;
  const todayPoints = habits.reduce((acc, h) => acc + (h.today ? h.points : 0), 0);
  const maxPoints = habits.reduce((acc, h) => acc + h.points, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: TEAL_BRIGHT }}>
            {doneCount}/{habits.length} TODAY
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>
            +{todayPoints} / +{maxPoints} PTS
          </span>
        </div>
        <a href="ClientHabits.html" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: TEAL_BRIGHT, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          OPEN HABITS <span>→</span>
        </a>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {habits.map((h) => (
          <div key={h.id} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
            padding: "12px 14px", background: h.today ? "rgba(30,192,168,0.06)" : "rgba(242,237,228,0.04)",
            border: `1px solid ${h.today ? "rgba(30,192,168,0.2)" : "rgba(242,237,228,0.08)"}`,
            borderRadius: 8,
          }}>
            <HabitCheckbox checked={h.today} onClick={() => toggle(h.id)} type={h.type} size={22}
              ariaLabel={h.today ? "Mark not done" : "Mark done"} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: h.today ? "rgba(242,237,228,0.6)" : INK, textDecoration: h.today ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", color: h.type === "dont" ? "#ff8a6d" : TEAL_BRIGHT, marginRight: 6 }}>
                  {h.type === "dont" ? "DON'T" : "DO"}
                </span>
                {h.label}
              </div>
              <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {h.sub}
              </div>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.08em", color: TEAL_BRIGHT, whiteSpace: "nowrap" }}>+{h.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

if (typeof window !== "undefined") {
  window.HabitCheckbox = HabitCheckbox;
  window.HabitsWidget = HabitsWidget;
  window.DEFAULT_HABITS = DEFAULT_HABITS;
  window.habitStreak = habitStreak;
}
