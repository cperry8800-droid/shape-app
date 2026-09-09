
const DEFAULT_GOALS_STATE = {
  goals: [
    { t: "50 active clients by July",     cur: 34, tgt: 50, sub: "16 to go · +3/wk pace gets there Jun 29" },
    { t: "$20k MRR by Q3",                cur: 14820, tgt: 20000, sub: "$5.2k to go · 92% retention holds = Aug 15", money: true },
    { t: "Publish 2 new programs",        cur: 1, tgt: 2, sub: "Return-to-lifting shipping next week" },
    { t: "95% avg client adherence",      cur: 92, tgt: 95, sub: "30d rolling · +3 pts needed", pct: true },
  ],
  calc: { rate: 85, spw: 22, prog: 400, workoutSales: 300, currentWeekly: 4620 },
  momentum: [
    ["+11","Net new clients","vs +6 last Q"],
    ["+$3.4k","MRR growth","vs +$1.8k last Q"],
    ["2","Programs shipped","vs 1 last Q"],
    ["+4 pts","Adherence","vs +2 pts last Q"]
  ]
};

function Chip({ children, onClick, danger }) {
  const [hover, setHover] = React.useState(false);
  const color = danger ? "#ff8a6d" : TEAL_BRIGHT;
  return (
    <button onClick={onClick}
      onMouseOver={()=>setHover(true)} onMouseOut={()=>setHover(false)}
      style={{ background: hover ? "rgba(46,224,196,0.08)" : "transparent", border: 0, padding: "4px 8px", borderRadius: 6, color, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function ModalShell({ title, eyebrow, onClose, children, footer }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.7)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PAPER, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
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
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.55)" }}>{label}</span>
      <input type={type || "text"} value={value == null ? "" : value} onChange={e => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.14)", color: INK, padding: "10px 12px", borderRadius: 6, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5 }}
      />
    </label>
  );
}

// ── Live metric bindings for a goal (review 2026-09-09, R9) ────────────────
// A goal's CURRENT was always a number the coach typed, so "34 of 50 active
// clients" stayed 34 while the roster moved. Binding it names a figure the
// practice can answer for itself, and the card then reads a measurement.
//
// ⚠ A BOUND GOAL WHOSE FIGURE CANNOT BE READ SHOWS "—", NOT THE STORED NUMBER.
// Falling back to the last typed value is exactly how a stale figure gets
// presented as current — the thing this binding exists to stop.
const GOAL_METRICS = [
  ["", "Type it in"],
  ["activeClients", "Active clients"],
  ["mrrNetMonthly", "MRR · net per month"],
  ["avgAdherencePct", "Avg client adherence %"],
];
function goalLiveValue(metric, live) {
  if (!metric || !live) return undefined;
  if (live.kind !== "live") return null;          // can't read → "—"
  if (metric === "activeClients") return live.activeClients;
  if (metric === "mrrNetMonthly") return live.mrrNetCents == null ? null : Math.round(live.mrrNetCents / 100);
  if (metric === "avgAdherencePct") return live.avgAdherencePct;
  return null;
}

function GoalEditModal({ goal, onClose, onSave, onDelete }) {
  const [g, setG] = React.useState(goal || { t: "", cur: 0, tgt: 100, sub: "", money: false, pct: false });
  return (
    <ModalShell
      eyebrow={goal ? "EDIT · GOAL" : "NEW · GOAL"}
      title={goal ? "Edit goal." : "New goal."}
      onClose={onClose}
      footer={<>
        {onDelete && <button onClick={onDelete} style={{ background: "transparent", color: "#ff8a6d", border: "1px solid rgba(255,138,109,0.35)", padding: "10px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer", marginRight: "auto" }}>Delete</button>}
        <button onClick={onClose} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onSave(g)} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Save</button>
      </>}
    >
      <Field label="TITLE" value={g.t} onChange={v => setG({ ...g, t: v })} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="CURRENT" type="number" value={g.cur} onChange={v => setG({ ...g, cur: v })} />
        <Field label="TARGET" type="number" value={g.tgt} onChange={v => setG({ ...g, tgt: v })} />
      </div>
      <div style={{ marginTop: 2 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)", marginBottom: 6 }}>CURRENT READS FROM</div>
        <select value={g.metric || ""} onChange={e => setG({ ...g, metric: e.target.value || undefined })}
          style={{ width: "100%", background: "rgba(242,237,228,0.06)", color: INK, border: "1px solid rgba(242,237,228,0.18)", borderRadius: 8, padding: "9px 11px", fontFamily: sans, fontSize: 13 }}>
          {GOAL_METRICS.map(([v, label]) => <option key={v} value={v} style={{ color: "#1a1612" }}>{label}</option>)}
        </select>
      </div>
      <Field label="SUBTEXT" value={g.sub} onChange={v => setG({ ...g, sub: v })} />
      <div style={{ display: "flex", gap: 18, marginTop: 4, color: INK, fontSize: 13 }}>
        <label style={{ display: "flex", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={!!g.money} onChange={e => setG({ ...g, money: e.target.checked, pct: e.target.checked ? false : g.pct })} /> Money ($)</label>
        <label style={{ display: "flex", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={!!g.pct} onChange={e => setG({ ...g, pct: e.target.checked, money: e.target.checked ? false : g.money })} /> Percent (%)</label>
      </div>
    </ModalShell>
  );
}

function CalcEditModal({ calc, labels, onClose, onSave }) {
  const [c, setC] = React.useState({ ...calc });
  return (
    <ModalShell
      eyebrow="EDIT · REVENUE CALCULATOR"
      title="Calculator inputs."
      onClose={onClose}
      footer={<>
        <button onClick={onClose} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onSave(c)} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Save</button>
      </>}
    >
      {labels.map(([key, label]) => (
        <Field key={key} label={label} type="number" value={c[key]} onChange={v => setC({ ...c, [key]: v === "" ? 0 : v })} />
      ))}
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
        <button onClick={onClose} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Cancel</button>
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
  const [editCalc, setEditCalc] = React.useState(false);
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
        setState(s => ({ ...s, ...remote, goals: ensureGoalIds(remote.goals || s.goals), calc: { ...s.calc, ...(remote.calc || {}) } }));
      } else {
        // Signed in with no saved goals → a clean empty state, not the demo goals.
        setState(s => ({ ...s, goals: [], momentum: [], calc: { rate: 0, spw: 0, prog: 0, workoutSales: 0, currentWeekly: 0 } }));
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

  const { goals, calc, momentum } = state;
  const { rate, spw, prog, workoutSales = 0, currentWeekly } = calc;
  const PLATFORM_FEE_RATE = 0.15;
  const grossWeekly = rate*spw + prog + workoutSales;
  const monthly = grossWeekly * 4.33 * (1 - PLATFORM_FEE_RATE);
  const weekly = monthly / 4.33;
  const quarterly = monthly * 3;
  const annual = monthly * 12;
  // ⚠ The sign goes OUTSIDE the currency symbol. This read `"$" + n` and every
  // caller happened to pass a positive, so a shortfall rendered "$-6,007" — and
  // binding the pace to real subscriptions is exactly what starts producing
  // negatives (a coach whose calculator is still zeroed is now BELOW their
  // actual pace rather than level with a typed 0).
  const fmt = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString();
  // ⚠ THE PACE THE CALCULATOR COMPARES AGAINST WAS A NUMBER THE COACH TYPED.
  // "vs $4,620 current pace" was `calc.currentWeekly`, entered once and never
  // revisited — so the whole comparison drifted quietly out of date. When the
  // coach has not set one and the practice can answer, use the real weekly net
  // from their subscriptions and SAY which it is; a typed figure still wins,
  // because a coach who set one is asserting something the subscriptions do
  // not know (cash work, a rate change landing next month).
  const liveWeeklyNet = live && live.kind === "live" && live.weeklyNetCents != null ? live.weeklyNetCents / 100 : null;
  const paceIsLive = !Number(currentWeekly) && liveWeeklyNet != null;
  const currentNet = paceIsLive ? liveWeeklyNet : currentWeekly * (1 - PLATFORM_FEE_RATE);
  const paceDelta = weekly - currentNet;

  // Each card below becomes a draggable/resizable DashGrid widget (role=trainer, tab=goal),
  // mirroring the Score refactor. The DashPage hero (title/actions) stays as the page header;
  // only the card stack is gridded. Each goal is a half-width widget; calc + momentum are full.
  const widgets = goals.map((g, i) => ({ key: "goal-" + (g.id || i), title: g.t || "Goal", size: "half", render: () => {
    // A bound goal reads its CURRENT from the practice; undefined means the
    // goal is not bound (use the typed number), null means it IS bound and the
    // figure could not be read — which shows "—", never the stale typed one.
    const bound = goalLiveValue(g.metric, live);
    const liveCur = bound === undefined ? Number(g.cur) || 0 : bound;
    const unreadable = bound === null;
    const pct = unreadable ? 0 : Math.min((Number(liveCur)||0) / (Number(g.tgt)||1), 1);
    const curF = unreadable ? "—" : g.money ? `$${Number(liveCur).toLocaleString()}` : g.pct ? `${liveCur}%` : liveCur;
    const tgtF = g.money ? `$${Number(g.tgt).toLocaleString()}` : g.pct ? `${g.tgt}%` : g.tgt;
    const metricLabel = (GOAL_METRICS.find(([v]) => v === g.metric) || [])[1];
    return (
      <Card style={{ padding: 26, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>GOAL · {unreadable ? "—" : Math.round(pct*100) + "%"}</div>
          <Chip onClick={() => setEditGoalIdx(i)}>EDIT</Chip>
        </div>
        <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.015em", marginBottom: 16 }}>{g.t}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(242,237,228,0.55)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
          <span>{curF}</span><span>{tgtF}</span>
        </div>
        <div style={{ height: 8, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${pct*100}%`, background: TEAL }} />
        </div>
        <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.6)", lineHeight: 1.5 }}>{g.sub}</div>
        {g.metric && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", marginTop: 10 }}>
            {unreadable ? "Couldn't read " + (metricLabel || "this figure").toLowerCase() : "Live · " + (metricLabel || g.metric)}
          </div>
        )}
      </Card>
    );
  } })).concat([
    { key: "calc", title: "Revenue calculator", size: "full", render: () => (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <SectionTitle right="SET YOUR TARGET">Revenue calculator</SectionTitle>
          <Chip onClick={() => setEditCalc(true)}>EDIT</Chip>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 32, padding: "8px 4px 4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {[
              ["Session rate", "rate", rate, 20, 300, 5, v => `$${v}`],
              ["Sessions / week", "spw", spw, 0, 60, 1, v => `${v}`],
              ["Program subscriptions / week", "prog", prog, 0, 5000, 50, v => `$${v}`],
              ["One-time workout sales / week", "workoutSales", workoutSales, 0, 5000, 25, v => `$${v}`],
            ].map(([label, key, val, min, max, step, fmtV]) => (
              <div key={key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, color: "rgba(242,237,228,0.7)" }}>{label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: INK }}>{fmtV(val)}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={val}
                  onChange={e => setState({ ...state, calc: { ...calc, [key]: +e.target.value } })}
                  onMouseUp={e => persist({ ...state, calc: { ...calc, [key]: +e.target.value } })}
                  onTouchEnd={e => persist({ ...state, calc: { ...calc, [key]: +e.target.value } })}
                  style={{ width: "100%", accentColor: "#0ac5a8", cursor: "pointer" }} />
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.5)", lineHeight: 1.5, marginTop: 4 }}>
              Based on session earnings, program subscriptions, and one-time workout sales. Numbers shown are <strong style={{ color: INK }}>take-home</strong> after Shape's 15% platform fee. Gross this week: <span style={{ color: INK }}>{fmt(grossWeekly)}</span>.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignSelf: "start" }}>
            {[
              ["WEEKLY TAKE-HOME", fmt(weekly), `vs ${fmt(currentNet)} ${paceIsLive ? "from your subscriptions" : "current pace"} · ${fmt(grossWeekly)} gross`, paceDelta],
              ["MONTHLY TAKE-HOME", fmt(monthly), `${fmt(grossWeekly * 4.33)} gross · 4.33 weeks avg`, null],
              ["QUARTERLY TAKE-HOME", fmt(quarterly), `${fmt(grossWeekly * 4.33 * 3)} gross · 3 months`, null],
              ["ANNUAL TAKE-HOME", fmt(annual), `${fmt(grossWeekly * 4.33 * 12)} gross · 12 months`, null],
            ].map(([lab, val, sub, delta], i) => (
              <div key={i} style={{ padding: 20, background: i === 0 ? "rgba(10,197,168,0.1)" : "rgba(242,237,228,0.04)", border: `1px solid ${i === 0 ? "rgba(10,197,168,0.25)" : "rgba(242,237,228,0.08)"}`, borderRadius: 10 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: i === 0 ? TEAL_BRIGHT : "rgba(242,237,228,0.55)", marginBottom: 10 }}>{lab}</div>
                <div style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 6 }}>
                  {delta != null ? (
                    <span style={{ color: delta >= 0 ? TEAL_BRIGHT : "#ff8a6d" }}>{delta >= 0 ? "+" : ""}{fmt(delta)} </span>
                  ) : null}
                  {sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    ) },
    { key: "momentum", title: "Momentum", size: "full", render: () => {
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
          <SectionTitle right={isComputed ? "MEASURED · 30D" : "THIS QUARTER"}>Momentum</SectionTitle>
          <Chip onClick={() => setEditMomentum(rows)}>EDIT</Chip>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, padding: "12px 4px" }}>
          {rows.map((m,i)=>(
            <div key={i}>
              <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1 }}>{m[0]}</div>
              <div style={{ fontSize: 12.5, marginTop: 8 }}>{m[1]}</div>
              <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>{m[2]}</div>
            </div>
          ))}
        </div>
        {isComputed && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)" }}>
            From your own subscriptions · edit to write your own
          </div>
        )}
      </Card>
      );
    } },
  ]);

  return (
    <DashPage
      navItems={trainerNavItems("goal")}
      payoutCard={trainerPayoutCard}
      eyebrow="YOUR GOALS · Q2 2026"
      title="Goal"
      subtitle={signedIn ? "What you're building toward this quarter." : "Sample view — sign in to save your own goals."}
      actions={<>
        <button onClick={() => persist({ ...state, goals: [] })} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Archive</button>
        <button onClick={() => setEditGoalIdx("new")} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>+ New goal</button>
      </>}
    >
      <DashGrid role="trainer" tab="goal" widgets={widgets} />

      {editGoalIdx != null && (
        <GoalEditModal
          goal={editGoalIdx === "new" ? null : goals[editGoalIdx]}
          onClose={() => setEditGoalIdx(null)}
          onSave={saveGoal}
          onDelete={editGoalIdx === "new" ? null : deleteGoal}
        />
      )}
      {editCalc && (
        <CalcEditModal
          calc={calc}
          labels={[["rate","Session rate ($)"],["spw","Sessions / week"],["prog","Program subscriptions / week ($)"],["workoutSales","One-time workout sales / week ($)"],["currentWeekly","Current weekly pace ($)"]]}
          onClose={() => setEditCalc(false)}
          onSave={c => { setEditCalc(false); persist({ ...state, calc: c }); }}
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
