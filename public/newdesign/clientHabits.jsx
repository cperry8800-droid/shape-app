// Seven days, oldest -> newest. Today is the rightmost slot.
const DAY_LABELS = ["THU", "FRI", "SAT", "SUN", "MON", "TUE", "WED"];

const SEED_HABITS = DEFAULT_HABITS;

function streakFor(h) { return habitStreak(h); }

function HabitRow({ h, onToggle, onRemove }) {
  const done = h.today;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "32px 1fr auto auto auto", gap: 12, alignItems: "center",
      padding: "14px 4px", borderTop: "1px solid rgba(242,237,228,0.06)",
    }}>
      <HabitCheckbox checked={done} onClick={() => onToggle(h.id)} type={h.type}
        ariaLabel={done ? "Mark not done" : "Mark done"} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: done ? "rgba(242,237,228,0.6)" : INK, textDecoration: done ? "line-through" : "none" }}>
          {h.label}
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>{h.sub}</div>
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", color: TEAL_BRIGHT, whiteSpace: "nowrap" }}>
        +{h.points}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em",
        color: streakFor(h) > 0 ? "rgba(242,237,228,0.7)" : "rgba(242,237,228,0.3)", whiteSpace: "nowrap" }}>
        {streakFor(h)}d
      </span>
      <button onClick={() => onRemove(h.id)} aria-label="Remove habit" title="Remove"
        style={{ background: "transparent", border: 0, color: "rgba(242,237,228,0.35)", fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>
        &times;
      </button>
    </div>
  );
}

function ClientHabitsPage() {
  const [habits, setHabits] = React.useState(() => loadHabitToday(SEED_HABITS));
  const [visibility, setVisibility] = React.useState("friends");
  const [synced, setSynced] = React.useState(false);

  // Persist today's checked state per-day (shared with the dashboard widget).
  React.useEffect(() => { saveHabitToday(habits); }, [habits]);

  // On mount, try to hydrate from the signed-in user's server-side habits.
  // If the user isn't signed in (or the API returns nothing), we silently
  // fall back to localStorage behavior.
  React.useEffect(() => {
    let alive = true;
    fetch('/api/client/habits', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d || !Array.isArray(d.habits)) return;
        const today = new Date().toISOString().slice(0, 10);
        const mapped = d.habits.map(h => {
          const hist = Array.isArray(h.history) ? h.history : [];
          // Build a 6-cell history strip ending yesterday.
          const strip = [];
          for (let i = 6; i >= 1; i--) {
            const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - i);
            strip.push(hist.includes(d.toISOString().slice(0,10)));
          }
          return {
            id: h.id,
            type: h.type === 'avoid' ? 'dont' : 'do',
            label: h.name,
            sub: h.type === 'avoid' ? "Tap when you've avoided it today" : 'Keep the streak alive',
            points: 3,
            visibility: h.visibility || 'private',
            history: strip,
            today: hist.includes(today),
            _server: true,
          };
        });
        setHabits(mapped);
        setSynced(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const apiPost = (body) => fetch('/api/client/habits', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => (r.ok ? r.json() : null)).catch(() => null);

  const toggleToday = (id) => {
    setHabits(hs => hs.map(h => h.id === id ? { ...h, today: !h.today } : h));
    if (synced) {
      // The user's LOCAL calendar day (en-CA → YYYY-MM-DD), never UTC, so an
      // evening check-off lands on today and not tomorrow.
      const today = new Date().toLocaleDateString('en-CA');
      apiPost({ action: 'toggle', id, date: today });
    }
  };

  const addHabit = (type) => {
    const promptLabel = type === "dont"
      ? "What do you want to avoid? (e.g. “No phone in bed”)"
      : "New habit to do (e.g. “Meditate 10 min”)";
    const label = window.prompt(promptLabel);
    if (!label || !label.trim()) return;
    const localId = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) + "-" + Math.random().toString(36).slice(2, 6);
    const draft = {
      id: localId, type, label: label.trim(),
      sub: type === "dont" ? "Tap when you've avoided it today" : "Just added — start your streak today",
      points: 3,
      visibility,
      history: [false, false, false, false, false, false], today: false,
    };
    setHabits(hs => [...hs, draft]);
    if (synced) {
      apiPost({ action: 'create', name: label.trim(), type: type === 'dont' ? 'avoid' : 'do', visibility })
        .then(d => {
          if (!d || !d.habit) return;
          setHabits(hs => hs.map(h => h.id === localId ? { ...h, id: d.habit.id, _server: true } : h));
        });
    }
  };

  const removeHabit = (id) => {
    if (!window.confirm("Remove this habit? History will be discarded.")) return;
    setHabits(hs => hs.filter(h => h.id !== id));
    if (synced) apiPost({ action: 'delete', id });
  };

  const dos = habits.filter(h => h.type === "do");
  const donts = habits.filter(h => h.type === "dont");

  const todayDone = habits.filter(h => h.today).length;
  const todayPct = habits.length ? Math.round((todayDone / habits.length) * 100) : 0;
  const weekTotal = habits.reduce((acc, h) => acc + h.history.filter(Boolean).length + (h.today ? 1 : 0), 0);
  const weekMax = habits.length * 7;
  const weekPct = weekMax ? Math.round((weekTotal / weekMax) * 100) : 0;
  const longest = habits.reduce((m, h) => Math.max(m, streakFor(h)), 0);

  // Shape Score contribution from habits
  const todayPoints = habits.reduce((acc, h) => acc + (h.today ? h.points : 0), 0);
  const weekPoints = habits.reduce((acc, h) => acc + h.history.reduce((a, on) => a + (on ? h.points : 0), 0) + (h.today ? h.points : 0), 0);

  // Each card below becomes a draggable/resizable DashGrid widget (role=client, tab=habits),
  // mirroring the client Score rollout. The DashPage hero (title/subtitle/actions) stays as
  // the page header; only the card stack is gridded. Each render returns ONE card element
  // with no outer margin — DashGrid handles spacing.
  const widgets = [
    { key: "kpis", title: "Habit KPIs", size: "full", render: () => (
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)",
        borderRadius: 10, overflow: "hidden",
      }}>
        {[
          { l: "Today",          k: `${todayDone}/${habits.length}`, sub: `${todayPct}% complete` },
          { l: "This week",      k: `${weekTotal}/${weekMax}`,        sub: `${weekPct}% adherence` },
          { l: "Longest streak", k: `${longest}d`,                     sub: longest >= 7 ? "you're in the zone" : "build it up" },
          { l: "Score today",    k: `+${todayPoints}`,                 sub: `+${weekPoints} this week` },
        ].map((k, i) => (
          <div key={i} style={{ padding: "20px 20px", borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)", marginBottom: 10, textTransform: "uppercase" }}>{k.l}</div>
            <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{k.k}</div>
            <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 6 }}>{k.sub}</div>
          </div>
        ))}
      </div>
    ) },

    { key: "sharing", title: "Sharing", size: "full", render: () => (
      <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "center" }}>
        <div>
          <SectionTitle right="ACCOUNTABILITY">Sharing</SectionTitle>
          <div style={{ fontSize: 13.5, color: "rgba(242,237,228,0.68)", lineHeight: 1.5 }}>
            Choose who can see completed habits and streak updates. Missed habits stay private unless you opt into sharing them.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(110px, 1fr))", gap: 8 }}>
          {[
            ["public", "Public"],
            ["friends", "Friends only"],
            ["private", "Private"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setVisibility(key)} style={{
              padding: "10px 12px",
              borderRadius: 999,
              border: visibility === key ? `1px solid ${TEAL_BRIGHT}` : "1px solid rgba(242,237,228,0.16)",
              background: visibility === key ? "rgba(10,197,168,0.12)" : "transparent",
              color: visibility === key ? TEAL_BRIGHT : "rgba(242,237,228,0.72)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>
      </Card>
    ) },

    { key: "dos", title: "Do's", size: "half", render: () => (
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Do's</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: TEAL_BRIGHT }}>
              {dos.filter(h => h.today).length}/{dos.length} TODAY
            </span>
          </div>
          <button onClick={() => addHabit("do")}
            style={{ background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "5px 12px", borderRadius: 999, fontFamily: sans, fontSize: 11.5, cursor: "pointer" }}>
            + Add a do
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginBottom: 4 }}>
          Check the circle when you've done it today.
        </div>
        {dos.length === 0
          ? <div style={{ padding: "24px 4px", color: "rgba(242,237,228,0.5)", fontSize: 13 }}>No do's yet.</div>
          : dos.map((h) => <HabitRow key={h.id} h={h} onToggle={toggleToday} onRemove={removeHabit} />)}
      </Card>
    ) },

    { key: "donts", title: "Don'ts", size: "half", render: () => (
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Don'ts</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: TEAL_BRIGHT }}>
              {donts.filter(h => h.today).length}/{donts.length} TODAY
            </span>
          </div>
          <button onClick={() => addHabit("dont")}
            style={{ background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "5px 12px", borderRadius: 999, fontFamily: sans, fontSize: 11.5, cursor: "pointer" }}>
            + Add a don't
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginBottom: 4 }}>
          Check the square when you've successfully avoided it today.
        </div>
        {donts.length === 0
          ? <div style={{ padding: "24px 4px", color: "rgba(242,237,228,0.5)", fontSize: 13 }}>No don'ts yet.</div>
          : donts.map((h) => <HabitRow key={h.id} h={h} onToggle={toggleToday} onRemove={removeHabit} />)}
      </Card>
    ) },

    { key: "grid", title: "Grid", size: "full", render: () => (
      <Card>
        <SectionTitle right="LAST 7 DAYS">Grid</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: `1.4fr repeat(7, 1fr)`, gap: 8, alignItems: "center", marginBottom: 6 }}>
          <div />
          {DAY_LABELS.map((d, i) => (
            <div key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(242,237,228,0.4)", textAlign: "center" }}>{d}</div>
          ))}
        </div>
        {habits.map((h, i) => {
          const cells = [...h.history, h.today];
          return (
            <div key={h.id} style={{ display: "grid", gridTemplateColumns: `1.4fr repeat(7, 1fr)`, gap: 8, alignItems: "center", padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
              <div style={{ fontSize: 12, color: "rgba(242,237,228,0.85)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.1em", color: h.type === "dont" ? "#ff8a6d" : TEAL_BRIGHT, textTransform: "uppercase" }}>
                  {h.type === "dont" ? "DON'T" : "DO"}
                </span>
                <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{h.label}</span>
              </div>
              {cells.map((on, j) => {
                const isToday = j === cells.length - 1;
                const square = h.type === "dont";
                return (
                  <div key={j} style={{ height: 22, borderRadius: square ? 4 : 11,
                    background: on ? (isToday ? TEAL : "rgba(10,197,168,0.45)") : "rgba(242,237,228,0.06)",
                    border: isToday ? `1px solid ${on ? "transparent" : "rgba(46,224,196,0.4)"}` : "none",
                  }} />
                );
              })}
            </div>
          );
        })}
      </Card>
    ) },

    { key: "scorecard", title: "Shape Score · from habits", size: "half", render: () => (
      <div data-tour="hero-habits">
      <Card style={{ background: "rgba(10,197,168,0.06)", border: "1px solid rgba(10,197,168,0.25)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>SHAPE SCORE · FROM HABITS</div>
        <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.02em", lineHeight: 1, color: TEAL_BRIGHT }}>+{weekPoints}</div>
        <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.7)", marginTop: 8, lineHeight: 1.5 }}>
          Earned from habits this week. Each row's <span style={{ color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace" }}>+pts</span> rolls into your Shape Score nightly.
        </div>
        <a href="ClientScore.html" style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: TEAL_BRIGHT, textDecoration: "none" }}>
          SEE FULL BREAKDOWN <span>→</span>
        </a>
      </Card>
      </div>
    ) },

    { key: "trend", title: "Two-week trend", size: "half", render: () => (
      <Card>
        <SectionTitle>Two-week trend</SectionTitle>
        <div style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.02em", lineHeight: 1 }}>{weekPct}%</div>
        <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 8 }}>Adherence · vs — last week</div>
      </Card>
    ) },

    { key: "coachnote", title: "From Maya", size: "full", render: () => (
      <Card>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>FROM MAYA · MON</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(242,237,228,0.85)" }}>
          Sleep is the one I want you to defend. If you're under 7 hours twice in a row, deload the next squat session.
        </div>
      </Card>
    ) },
  ];

  return (
    <DashPage
      navItems={clientNavItems("habits")}
      payoutCard={clientPayoutCard}
      eyebrow="DAILY · WEEK 16 OF 52"
      title="Habits"
      subtitle="Do's earn Shape Score when you complete them. Don'ts earn the same when you successfully avoid them. Tap a circle (do) or square (don't) to log today."
      actions={<>
        <a href="ClientScore.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>How streaks work</a>
        <button onClick={() => addHabit("do")} title="Add habit" style={{ width: 42, height: 42, borderRadius: 999, background: INK, color: PAPER, border: 0, fontFamily: sans, fontSize: 22, fontWeight: 500, cursor: "pointer", lineHeight: 1 }}>+</button>
      </>}
    >
      <DashGrid role="client" tab="habits" widgets={widgets} />
    </DashPage>
  );
}
