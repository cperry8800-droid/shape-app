
const DEFAULT_GOALS_STATE = {
  goals: [
    { t: "50 active clients by July",     cur: 34, tgt: 50, sub: "16 to go · +3/wk pace gets there Jun 29" },
    { t: "$20k MRR by Q3",                cur: 14820, tgt: 20000, sub: "$5.2k to go · 92% retention holds = Aug 15", money: true },
    { t: "Publish 2 new programs",        cur: 1, tgt: 2, sub: "Return-to-lifting shipping next week" },
    { t: "95% avg client adherence",      cur: 92, tgt: 95, sub: "30d rolling · +3 pts needed", pct: true },
  ],
  momentum: [
    ["+11","Net new clients","vs +6 last Q"],
    ["+$3.4k","MRR growth","vs +$1.8k last Q"],
    ["2","Programs shipped","vs 1 last Q"],
    ["+4 pts","Adherence","vs +2 pts last Q"]
  ]
};

function Chip({ children, onClick, danger }) {
  const [hover, setHover] = React.useState(false);
  const color = danger ? "var(--sh-danger, #e07856)" : "var(--sh-accent-ink, #2ee0c4)";
  return (
    <button onClick={onClick}
      onMouseOver={()=>setHover(true)} onMouseOut={()=>setHover(false)}
      style={{ background: hover ? "rgba(var(--sh-accent-rgb, 46,224,196),0.08)" : "transparent", border: 0, padding: "4px 8px", borderRadius: 6, color, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function ModalShell({ title, eyebrow, onClose, children, footer }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.7)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PAPER, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>{eyebrow}</div>
        <div style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", margin: "6px 0 20px", color: INK }}>{title}</div>
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type }) {
  return (
    <label style={{ display: "grid", gap: 4, marginBottom: 12 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "var(--sh-ink2, #a09b94)" }}>{label}</span>
      <input type={type || "text"} value={value == null ? "" : value} onChange={e => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        style={{ background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", color: INK, padding: "10px 12px", borderRadius: 6, fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 13.5 }}
      />
    </label>
  );
}

function GoalEditModal({ goal, role, onClose, onSave, onDelete }) {
  const METRICS = goalMetricsFor(role);
  const [g, setG] = React.useState(goal || { t: "", cur: 0, tgt: 100, sub: "", money: false, pct: false });
  return (
    <ModalShell
      eyebrow={goal ? "EDIT · GOAL" : "NEW · GOAL"}
      title={goal ? "Edit goal." : "New goal."}
      onClose={onClose}
      footer={<>
        {onDelete && <button onClick={onDelete} style={{ background: "transparent", color: "var(--sh-danger, #e07856)", border: "1px solid rgba(255,138,109,0.35)", padding: "10px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer", marginRight: "auto" }}>Delete</button>}
        <button onClick={onClose} style={{ background: "transparent", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onSave(g)} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Save</button>
      </>}
    >
      <Field label="TITLE" value={g.t} onChange={v => setG({ ...g, t: v })} />
      {/* ⚠ CURRENT DISAPPEARS ONCE THE GOAL IS BOUND. The card reads the live
          figure and ignores `cur` entirely, so leaving the input on screen was
          a control that accepted a number and silently discarded it. */}
      <div style={{ display: "grid", gridTemplateColumns: g.metric ? "1fr" : "1fr 1fr", gap: 12 }}>
        {!g.metric && <Field label="CURRENT" type="number" value={g.cur} onChange={v => setG({ ...g, cur: v })} />}
        <Field label="TARGET" type="number" value={g.tgt} onChange={v => setG({ ...g, tgt: v })} />
      </div>
      <div style={{ marginTop: 2 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: "var(--sh-ink2, #a09b94)", marginBottom: 6 }}>CURRENT READS FROM</div>
        {/* ⚠ THE UNIT COMES WITH THE METRIC. The card formats through `g.money`
            and `g.pct`, so changing only `metric` rendered MRR as a bare 12000,
            adherence as a bare 88, or an active-client count as `$12` on a goal
            that had been a revenue one. */}
        <select value={g.metric || ""} onChange={e => {
          const metric = e.target.value || undefined;
          setG({ ...g, metric, ...(metric ? goalMetricUnit(metric) : {}) });
        }}
          style={{ width: "100%", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.06)", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 8, padding: "9px 11px", fontFamily: sans, fontSize: 13 }}>
          {METRICS.map(([v, label]) => <option key={v} value={v} style={{ color: "#1a1612", background: "#ffffff" }}>{label}</option>)}
        </select>
      </div>
      <Field label="SUBTEXT" value={g.sub} onChange={v => setG({ ...g, sub: v })} />
      {/* Locked while a metric is bound: the unit is then a property of the
          measurement, not a preference, and a control that accepts a change the
          card overrides is the same dead input the CURRENT field was. */}
      <div style={{ display: "flex", gap: 18, marginTop: 4, color: INK, fontSize: 13, opacity: g.metric ? 0.5 : 1 }}>
        <label style={{ display: "flex", gap: 8, cursor: g.metric ? "default" : "pointer" }}><input type="checkbox" disabled={!!g.metric} checked={!!g.money} onChange={e => setG({ ...g, money: e.target.checked, pct: e.target.checked ? false : g.pct })} /> Money ($)</label>
        <label style={{ display: "flex", gap: 8, cursor: g.metric ? "default" : "pointer" }}><input type="checkbox" disabled={!!g.metric} checked={!!g.pct} onChange={e => setG({ ...g, pct: e.target.checked, money: e.target.checked ? false : g.money })} /> Percent (%)</label>
      </div>
      {g.metric && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sh-ink3, #75706a)" }}>Unit set by the metric</div>}
    </ModalShell>
  );
}

function MomentumEditModal({ momentum, onClose, onSave }) {
  const [m, setM] = React.useState(momentum.map(row => [...row]));
  return (
    <ModalShell
      eyebrow="EDIT · MOMENTUM"
      title="This quarter."
      onClose={onClose}
      footer={<>
        <button onClick={onClose} style={{ background: "transparent", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onSave(m)} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Save</button>
      </>}
    >
      {m.map((row, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1.5fr", gap: 10, marginBottom: 10 }}>
          <Field label="VALUE" value={row[0]} onChange={v => { const next = m.map(r => [...r]); next[i][0] = v; setM(next); }} />
          <Field label="LABEL" value={row[1]} onChange={v => { const next = m.map(r => [...r]); next[i][1] = v; setM(next); }} />
          <Field label="COMPARE" value={row[2]} onChange={v => { const next = m.map(r => [...r]); next[i][2] = v; setM(next); }} />
        </div>
      ))}
    </ModalShell>
  );
}

let _goalSeq = 0;
function ensureGoalIds(goals) {
  return (goals || []).map(g => (g && g.id) ? g : { ...g, id: "g" + (Date.now().toString(36)) + "-" + (_goalSeq++) });
}

function TrainerGoalPage() {
  const [state, setState] = React.useState(() => ({ ...DEFAULT_GOALS_STATE, goals: ensureGoalIds(DEFAULT_GOALS_STATE.goals) }));
  const [signedIn, setSignedIn] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [editGoalIdx, setEditGoalIdx] = React.useState(null); // number | 'new' | null
  // Holds the ROWS to edit (or false) — the modal is seeded with whatever the
  // card is showing, so opening it on a computed card adopts those figures as
  // the coach's own starting point rather than a blank grid.
  const [editMomentum, setEditMomentum] = React.useState(false);
  const live = useCoachLiveFigures("trainer");

  React.useEffect(() => {
    (async () => {
      if (!window.shapeDb) return;
      const user = await window.shapeDb.getUser();
      if (!user) return;
      setSignedIn(true);
      const remote = await window.shapeDb.getUserGoals("trainer");
      if (remote && Object.keys(remote).length > 0) {
        setState(s => ({ ...s, ...remote, goals: ensureGoalIds(remote.goals || s.goals) }));
      } else {
        // Signed in with no saved goals → a clean empty state, not the demo goals.
        setState(s => ({ ...s, goals: [], momentum: [] }));
      }
    })();
  }, []);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function persist(next) {
    setState(next);
    if (window.shapeDb && window.shapeDb.saveUserGoals) {
      const res = await window.shapeDb.saveUserGoals("trainer", next);
      showToast(res && res.error ? (res.error.message || "Save failed") : (signedIn ? "Saved." : "Sample view — sign in to save."));
    } else {
      showToast("Sample view — sign in to save.");
    }
  }

  function saveGoal(g) {
    const goals = [...state.goals];
    if (editGoalIdx === "new") goals.push(ensureGoalIds([g])[0]);
    else goals[editGoalIdx] = { ...goals[editGoalIdx], ...g };
    setEditGoalIdx(null);
    persist({ ...state, goals });
  }
  async function deleteGoal() {
    const cur = (state.goals || [])[editGoalIdx] || {};
    if (!(await window.ShapeConfirm.open({ title: "Delete this goal?", name: cur.t || cur.title, message: "This removes the goal from your saved goals.", confirmLabel: "Delete goal" }))) return;
    const goals = state.goals.filter((_, i) => i !== editGoalIdx);
    setEditGoalIdx(null);
    persist({ ...state, goals });
  }

  const { goals, momentum } = state;

  // ── A FIXED PAGE, NOT A BOARD (owner, 2026-10-15: "least overwhelming as possible, easy
  // to navigate", the builder removed "like Programs"). Three parts in one order: the
  // quarter's goals, how the quarter is going (Momentum), and what clients earn you, with
  // the planner one tap away on Business → Plan (dashBusiness.jsx DbzGoalEarn, 2026-10-17).
  // Each card keeps its own EDIT; there is nothing to drag, hide or resize.
  const goalCard = (g, i) => {
    // A bound goal reads its CURRENT from the practice; undefined means the
    // goal is not bound (use the typed number), null means it IS bound and the
    // figure could not be read — which shows "—", never the stale typed one.
    const bound = goalLiveValue(g.metric, live);
    const pending = bound === "loading";
    const liveCur = bound === undefined ? Number(g.cur) || 0 : bound;
    const unreadable = bound === null;
    const pct = (unreadable || pending) ? 0 : Math.min((Number(liveCur)||0) / (Number(g.tgt)||1), 1);
    const curF = (unreadable || pending) ? "—" : g.money ? `$${Number(liveCur).toLocaleString()}` : g.pct ? `${liveCur}%` : liveCur;
    const tgtF = g.money ? `$${Number(g.tgt).toLocaleString()}` : g.pct ? `${g.tgt}%` : g.tgt;
    const metricLabel = (goalMetricsFor("trainer").find(([v]) => v === g.metric) || [])[1];
    return (
      <Card style={{ padding: 26, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>GOAL · {(unreadable || pending) ? "—" : Math.round(pct*100) + "%"}</div>
          <Chip onClick={() => setEditGoalIdx(i)}>EDIT</Chip>
        </div>
        <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.015em", marginBottom: 16 }}>{g.t}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--sh-ink2, #a09b94)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
          <span>{curF}</span><span>{tgtF}</span>
        </div>
        <div style={{ height: 8, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${pct*100}%`, background: TEAL }} />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--sh-ink2, #a09b94)", lineHeight: 1.5 }}>{g.sub}</div>
        {g.metric && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-ink3, #75706a)", marginTop: 10 }}>
            {pending ? "Reading…" : unreadable ? "Couldn't read " + (metricLabel || "this figure").toLowerCase() : "Live · " + (metricLabel || g.metric)}
          </div>
        )}
      </Card>
    );
  };
  // The calculator is Business's "What clients earn you", started from this coach's live figures:
  // the weekly session-rate model it replaces took 15% off everything and scaled a week up to a month.
  const calcCard = (
      <Card>
        <SectionTitle right="AFTER SHAPE'S FEE">What clients earn you</SectionTitle>
        {typeof DbzGoalEarn === "function"
          ? <DbzGoalEarn role="trainer" live={live} />
          : <div style={{ fontSize: 12.5, color: "var(--sh-ink2, #a09b94)" }}>The calculator is on Business → Plan.</div>}
      </Card>
  );
  const momentumCard = () => {
      // ⚠ COMPUTED ONLY WHERE THERE IS NOTHING TO OVERWRITE. A signed-in coach
      // with no saved goals gets `momentum: []` — an empty card — and that is
      // exactly the gap the trajectory can fill. A coach who HAS typed rows
      // keeps them: silently replacing someone's own reading of their quarter
      // with a computed one is not a fix, it is data loss with a nicer label.
      const computed = momentum.length ? null : coachLiveMomentum(live);
      const rows = computed || momentum;
      const isComputed = !!computed;
      return (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <SectionTitle right={isComputed ? "MEASURED" : "THIS QUARTER"}>Momentum</SectionTitle>
          <Chip onClick={() => setEditMomentum(rows)}>EDIT</Chip>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 20, padding: "12px 4px" }}>
          {rows.map((m,i)=>(
            <div key={i}>
              <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1 }}>{m[0]}</div>
              <div style={{ fontSize: 12.5, marginTop: 8 }}>{m[1]}</div>
              <div style={{ fontSize: 11, color: "var(--sh-ink2, #a09b94)", marginTop: 2 }}>{m[2]}</div>
            </div>
          ))}
        </div>
        {isComputed && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-ink3, #75706a)" }}>
            From your own subscriptions · edit to write your own
          </div>
        )}
      </Card>
      );
  };

  return (
    <DashPage
      navItems={trainerNavItems("goal")}
      payoutCard={trainerPayoutCard}
      eyebrow={goalQuarterLabel()}
      title="Goal"
      subtitle={signedIn ? "What you're building toward this quarter." : "Sample view — sign in to save your own goals."}
      actions={<>
        <button onClick={() => persist({ ...state, goals: [] })} style={{ background: "transparent", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Archive</button>
        <button onClick={() => setEditGoalIdx("new")} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>+ New goal</button>
      </>}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {goals.length ? (
          <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {goals.map((g, i) => <React.Fragment key={g.id || i}>{goalCard(g, i)}</React.Fragment>)}
          </div>
        ) : (
          // No goals is a state with one next step, not an empty page.
          <div style={{ border: "1px dashed var(--sh-line2, #413d38)", borderRadius: 12, padding: "26px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>No goals for this quarter yet</div>
              <div style={{ fontSize: 13, color: "var(--sh-ink2, #a09b94)", marginTop: 4, lineHeight: 1.5 }}>Set one and track it here: clients, revenue, programs, or adherence.</div>
            </div>
            <button onClick={() => setEditGoalIdx("new")} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>+ New goal</button>
          </div>
        )}
        {momentumCard()}
        {calcCard}
      </div>

      {editGoalIdx != null && (
        <GoalEditModal
          goal={editGoalIdx === "new" ? null : goals[editGoalIdx]}
          role="trainer"
          onClose={() => setEditGoalIdx(null)}
          onSave={saveGoal}
          onDelete={editGoalIdx === "new" ? null : deleteGoal}
        />
      )}
      {editMomentum && (
        <MomentumEditModal
          // Seeded with what the CARD is showing: on a computed card that means
          // the coach starts from the measured figures rather than a blank grid.
          momentum={Array.isArray(editMomentum) ? editMomentum : momentum}
          onClose={() => setEditMomentum(false)}
          onSave={m => { setEditMomentum(false); persist({ ...state, momentum: m }); }}
        />
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: INK, color: PAPER, padding: "12px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, zIndex: 10000, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>{toast}</div>
      )}
    </DashPage>
  );
}
