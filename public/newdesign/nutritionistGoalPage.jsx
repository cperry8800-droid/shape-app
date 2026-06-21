
const DEFAULT_GOALS_STATE = {
  goals: [
    { t: "40 active clients by July",    cur: 28, tgt: 40, sub: "12 to go · +2/wk pace gets there Jul 4" },
    { t: "$15k MRR by Q3",               cur: 11240, tgt: 15000, sub: "$3.8k to go · 94% retention holds = Aug 22", money: true },
    { t: "Publish 2 new plans",          cur: 0, tgt: 2, sub: "Plant-forward v2 in draft" },
    { t: "92% avg log adherence",        cur: 89, tgt: 92, sub: "30d rolling · +3 pts needed", pct: true },
  ],
  calc: { consult: 120, cpw: 14, subs: 32, subPrice: 49, mealPlans: 200, currentWeekly: 2595 },
  momentum: [
    ["+7","Net new clients","vs +4 last Q"],
    ["+$2.1k","MRR growth","vs +$1.2k last Q"],
    ["1","Plan shipped","vs 1 last Q"],
    ["+6 pts","Adherence","vs +3 pts last Q"]
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

// Stable goal ids: DashGrid persists layout/hidden state by widget key, so the key
// must be tied to the goal's identity (not its array position). Legacy/default goals
// have no id — assign deterministic ones so existing goals keep their saved layout.
let goalIdSeq = 0;
function nextGoalId() { return "g" + Date.now().toString(36) + "_" + (goalIdSeq++).toString(36); }
function withGoalIds(goals) {
  return (goals || []).map((g, i) => (g && g.id) ? g : { ...g, id: "goal" + i });
}

function NutritionistGoalPage() {
  const [state, setState] = React.useState(() => ({ ...DEFAULT_GOALS_STATE, goals: withGoalIds(DEFAULT_GOALS_STATE.goals) }));
  const [signedIn, setSignedIn] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [editGoalId, setEditGoalId] = React.useState(null); // goal id | 'new' | null
  const [editCalc, setEditCalc] = React.useState(false);
  const [editMomentum, setEditMomentum] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      if (!window.shapeDb) return;
      const user = await window.shapeDb.getUser();
      if (!user) return;
      setSignedIn(true);
      const remote = await window.shapeDb.getUserGoals("nutritionist");
      if (remote && Object.keys(remote).length > 0) {
        setState(s => ({ ...s, ...remote, calc: { ...s.calc, ...(remote.calc || {}) }, goals: withGoalIds(remote.goals || s.goals) }));
      } else {
        // Signed in with no saved goals → a clean empty state, not the demo goals.
        setState(s => ({ ...s, goals: [], momentum: [], calc: { consult: 0, cpw: 0, subs: 0, subPrice: 0, mealPlans: 0, currentWeekly: 0 } }));
      }
    })();
  }, []);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function persist(next) {
    setState(next);
    if (window.shapeDb && window.shapeDb.saveUserGoals) {
      const res = await window.shapeDb.saveUserGoals("nutritionist", next);
      showToast(res && res.error ? (res.error.message || "Save failed") : (signedIn ? "Saved." : "Sample view — sign in to save."));
    } else {
      showToast("Sample view — sign in to save.");
    }
  }

  function saveGoal(g) {
    let goals;
    if (editGoalId === "new") {
      goals = [...state.goals, { ...g, id: nextGoalId() }];
    } else {
      goals = state.goals.map(x => x.id === editGoalId ? { ...g, id: editGoalId } : x);
    }
    setEditGoalId(null);
    persist({ ...state, goals });
  }
  function deleteGoal() {
    const goals = state.goals.filter(x => x.id !== editGoalId);
    setEditGoalId(null);
    persist({ ...state, goals });
  }

  const { goals, calc, momentum } = state;
  const { consult, cpw, subs, subPrice, mealPlans = 0, currentWeekly } = calc;
  const PLATFORM_FEE_RATE = 0.15;
  const grossWeekly = consult*cpw + (subs*subPrice)/4.33 + mealPlans;
  const monthly = grossWeekly * 4.33 * (1 - PLATFORM_FEE_RATE);
  const weekly = monthly / 4.33;
  const quarterly = monthly * 3;
  const annual = monthly * 12;
  const fmt = n => "$" + Math.round(n).toLocaleString();
  const currentNet = currentWeekly * (1 - PLATFORM_FEE_RATE);
  const paceDelta = weekly - currentNet;

  // Each card below becomes a draggable/resizable DashGrid widget (role=nutritionist, tab=goal),
  // mirroring the Score refactor. The DashPage hero (title/actions) stays as the page header;
  // only the card stack is gridded. Each goal is a half-width widget; calc + momentum are full.
  const widgets = goals.map((g) => ({ key: "goal-" + g.id, title: g.t || "Goal", size: "half", render: () => {
    const pct = Math.min((Number(g.cur)||0) / (Number(g.tgt)||1), 1);
    const curF = g.money ? `$${Number(g.cur).toLocaleString()}` : g.pct ? `${g.cur}%` : g.cur;
    const tgtF = g.money ? `$${Number(g.tgt).toLocaleString()}` : g.pct ? `${g.tgt}%` : g.tgt;
    return (
      <Card style={{ padding: 26, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>GOAL · {Math.round(pct*100)}%</div>
          <Chip onClick={() => setEditGoalId(g.id)}>EDIT</Chip>
        </div>
        <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.015em", marginBottom: 16 }}>{g.t}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(242,237,228,0.55)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
          <span>{curF}</span><span>{tgtF}</span>
        </div>
        <div style={{ height: 8, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${pct*100}%`, background: TEAL }} />
        </div>
        <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.6)", lineHeight: 1.5 }}>{g.sub}</div>
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
              ["Consult rate", "consult", consult, 40, 400, 5, v => `$${v}`],
              ["Consults / week", "cpw", cpw, 0, 40, 1, v => `${v}`],
              ["Meal plan subscribers", "subs", subs, 0, 500, 1, v => `${v}`],
              ["Subscription price / mo", "subPrice", subPrice, 9, 199, 5, v => `$${v}`],
              ["One-time meal plan sales / week", "mealPlans", mealPlans, 0, 3000, 25, v => `$${v}`],
            ].map(([label, key, val, min, max, step, fmtV], i) => (
              <div key={i}>
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
              Based on consult bookings, meal plan subscriptions, and one-time plan sales. Numbers shown are <strong style={{ color: INK }}>take-home</strong> after Shape's 15% platform fee. Gross this week: <span style={{ color: INK }}>{fmt(grossWeekly)}</span>.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignSelf: "start" }}>
            {[
              ["WEEKLY TAKE-HOME", fmt(weekly), `vs ${fmt(currentNet)} current pace · ${fmt(grossWeekly)} gross`, paceDelta],
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
    { key: "momentum", title: "Momentum", size: "full", render: () => (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <SectionTitle right="THIS QUARTER">Momentum</SectionTitle>
          <Chip onClick={() => setEditMomentum(true)}>EDIT</Chip>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, padding: "12px 4px" }}>
          {momentum.map((m,i)=>(
            <div key={i}>
              <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1 }}>{m[0]}</div>
              <div style={{ fontSize: 12.5, marginTop: 8 }}>{m[1]}</div>
              <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>{m[2]}</div>
            </div>
          ))}
        </div>
      </Card>
    ) },
  ]);

  return (
    <DashPage
      navItems={nutriNavItems("goal")}
      payoutCard={nutriPayoutCard}
      eyebrow="YOUR GOALS · Q2 2026"
      title="Goal"
      subtitle={signedIn ? "What you're building toward this quarter." : "Sample view — sign in to save your own goals."}
      actions={<>
        <button onClick={() => persist({ ...state, goals: [] })} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Archive</button>
        <button onClick={() => setEditGoalId("new")} style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>+ New goal</button>
      </>}
    >
      <DashGrid role="nutritionist" tab="goal" widgets={widgets} />

      {editGoalId != null && (
        <GoalEditModal
          goal={editGoalId === "new" ? null : goals.find(x => x.id === editGoalId)}
          onClose={() => setEditGoalId(null)}
          onSave={saveGoal}
          onDelete={editGoalId === "new" ? null : deleteGoal}
        />
      )}
      {editCalc && (
        <CalcEditModal
          calc={calc}
          labels={[["consult","Consult rate ($)"],["cpw","Consults / week"],["subs","Meal plan subscribers"],["subPrice","Subscription price ($)"],["mealPlans","One-time meal plan sales / week ($)"],["currentWeekly","Current weekly pace ($)"]]}
          onClose={() => setEditCalc(false)}
          onSave={c => { setEditCalc(false); persist({ ...state, calc: c }); }}
        />
      )}
      {editMomentum && (
        <MomentumEditModal
          momentum={momentum}
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
