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
        width: Math.max(44, size), height: Math.max(44, size), borderRadius: square ? 6 : 999, padding: 0, cursor: "pointer",
        background: checked ? TEAL : "transparent",
        border: checked ? `1px solid ${TEAL}` : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)",
        color: PAPER, fontSize: Math.round(size * 0.55), lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, border-color 0.15s", flex: "none",
      }}>
      {checked ? "✓" : ""}
    </button>
  );
}

// Shared live store for the website dashboard and dedicated page.
function habitDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function habitFromServer(h) {
  const dates = Array.isArray(h.history) ? h.history : [];
  const history = [];
  for (let i = 6; i >= 1; i--) { const d = new Date(); d.setDate(d.getDate() - i); history.push(dates.includes(habitDay(d))); }
  return { ...h, label: h.name, type: h.type === 'avoid' ? 'dont' : 'do', sub: h.type === 'avoid' ? "Tap when you've avoided it today" : 'Keep the streak alive', points: 3, history, dates, today: dates.includes(habitDay()) };
}
function useLiveHabits() {
  const [habits, setHabits] = React.useState([]);
  const [status, setStatus] = React.useState('loading');
  const [error, setError] = React.useState('');
  const [version, reload] = React.useReducer(n => n + 1, 0);
  const busy = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => {
    let valid = true;
    setStatus('loading');
    fetch('/api/client/habits', { credentials: 'same-origin', cache: 'no-store' })
      .then(async r => { const d = await r.json(); if (!r.ok || !Array.isArray(d.habits)) throw new Error(); return d; })
      .then(d => { if (valid) { setHabits(d.habits.map(habitFromServer)); setStatus('ready'); setError(''); } })
      .catch(() => { if (valid) { setStatus('error'); setError('Could not load habits. Please retry.'); } });
    return () => { valid = false; };
  }, [version]);
  React.useEffect(() => {
    let day = habitDay();
    const tick = () => { const next = habitDay(); if (next !== day) { day = next; reload(); } };
    const timer = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  const mutate = async body => {
    if (busy.current || status !== 'ready') return null;
    busy.current = true; setError('');
    try {
      const r = await fetch('/api/client/habits', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Could not save habit.');
      if (!alive.current) return null;
      setHabits(list => {
        if (body.action === 'create') return [...list, habitFromServer(d.habit)];
        if (body.action === 'delete') return list.filter(h => h.id !== body.id);
        if (body.action === 'set') return list.map(h => { if (h.id !== body.id) return h; const dates = new Set(h.dates); if (d.done) dates.add(body.date); else dates.delete(body.date); return habitFromServer({ ...h, name: h.label, type: h.type === 'dont' ? 'avoid' : 'do', history: [...dates] }); });
        return list.map(h => h.id === body.id ? { ...h, ...d.habit, label: d.habit.name || h.label, type: d.habit.type === 'avoid' ? 'dont' : 'do' } : h);
      });
      return d;
    } catch (e) { if (alive.current) setError('Could not save habit. Your change was not confirmed; please retry.'); return null; }
    finally { busy.current = false; }
  };
  return { habits, status, error, reload, mutate, toggle: id => { const h = habits.find(h => h.id === id); return h && mutate({ action: 'set', id, date: habitDay(), done: !h.today }); } };
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
  if (Array.isArray(h.dates)) {
    const dates = new Set(h.dates); const d = new Date(); let count = 0;
    if (!dates.has(habitDay(d))) d.setDate(d.getDate() - 1);
    while (dates.has(habitDay(d))) { count++; d.setDate(d.getDate() - 1); }
    return count;
  }
  let s = h.today ? 1 : 0;
  for (let i = h.history.length - 1; i >= 0; i--) {
    if (h.history[i]) s++;
    else break;
  }
  return s;
}

// Per-day persistence of which habits are marked done today. Keyed by the
// calendar date so it naturally resets each morning — matching habit-tracker
// semantics — and shared by the dashboard widget and the full Habits page so
// the two stay in sync. localStorage only; no backend.
function habitsStoreKey() {
  const d = new Date();
  return "shape.habits." + d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}
function loadHabitToday(seed) {
  try {
    const raw = localStorage.getItem(habitsStoreKey());
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        return seed.map(h => (h.id in saved ? { ...h, today: !!saved[h.id] } : h));
      }
    }
  } catch (e) {}
  return seed;
}
function saveHabitToday(habits) {
  try {
    const map = {};
    (habits || []).forEach(h => { map[h.id] = !!h.today; });
    localStorage.setItem(habitsStoreKey(), JSON.stringify(map));
  } catch (e) {}
}

// Compact widget for the Today dashboard. Shows up to `max` habits with
// inline checkboxes, a today-progress + Shape Score summary, and a link
// to the full Habits page. Today's checked state persists per-day in
// localStorage (shared with the full Habits page).
function HabitsWidget({ max = 5, items }) {
  const { habits: allHabits, status, error, reload, toggle } = useLiveHabits();
  const habits = allHabits.slice(0, max);

  const doneCount = habits.filter(h => h.today).length;
  const todayPoints = habits.reduce((acc, h) => acc + (h.today ? h.points : 0), 0);
  const maxPoints = habits.reduce((acc, h) => acc + h.points, 0);

  return (
    <div>
      {status !== 'ready' && <p role="status">{status === 'loading' ? 'Loading habits…' : error} {status === 'error' && <button onClick={reload}>Retry</button>}</p>}
      {status === 'ready' && error && <p role="alert">{error}</p>}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: TEAL_BRIGHT }}>
            {doneCount}/{habits.length} TODAY
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "var(--sh-ink2, #a09b94)" }}>
            +{todayPoints} / +{maxPoints} PTS
          </span>
        </div>
        <a href={dashShellHref("ClientHabits.html")} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: TEAL_BRIGHT, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          OPEN HABITS <span>→</span>
        </a>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {habits.map((h) => (
          <div key={h.id} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
            padding: "12px 14px", background: h.today ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.06)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.04)",
            border: `1px solid ${h.today ? "rgba(var(--sh-accent2-rgb, 10,197,168),0.2)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)"}`,
            borderRadius: 8,
          }}>
            <HabitCheckbox checked={h.today} onClick={() => toggle(h.id)} type={h.type} size={22}
              ariaLabel={h.today ? "Mark not done" : "Mark done"} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: h.today ? "var(--sh-ink2, #a09b94)" : INK, textDecoration: h.today ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", color: h.type === "dont" ? "#ff8a6d" : TEAL_BRIGHT, marginRight: 6 }}>
                  {h.type === "dont" ? "DON'T" : "DO"}
                </span>
                {h.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--sh-ink2, #a09b94)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
  window.loadHabitToday = loadHabitToday;
  window.saveHabitToday = saveHabitToday;
}
