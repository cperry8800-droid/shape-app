// Nutritionist Plans v2 — library + lifecycle zones and the meal-plan builder
// (dashboard-v2 final step). Logic lives in dashMealCore.js (pure, tested);
// this file is UI. Templates persist to /api/coach/plans (detail.mealBuilder);
// assignment snapshots into client_meal_plans via /api/nutritionist/meal-plan
// — the same store the client today-rail, mobile Eat tab, and auto-grocery
// already read. Signed out / API down: the demo templates render under the
// demo band and drafts go to localStorage, so the builder is fully usable in
// preview.
//
// Load order: pageShell → trainerDashboard → coachNav → clientNav →
// dashSignals → dashData → dashToday → dashClient (DashMealLedgerCard) →
// dashMealCore → this file.

const DMB_INK50 = "rgba(242,237,228,0.55)";
const DMB_MONO = "'JetBrains Mono', monospace";
const DMB_GOLD = "#d8a23a";
const DMB_RED = "#e0644b";

function dmbBtn(primary, c) {
  const col = c || DMB_GOLD;
  return primary
    ? { fontFamily: DMB_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#231803", background: col, border: 0, borderRadius: 4, padding: "8px 13px", cursor: "pointer" }
    : { fontFamily: DMB_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "8px 13px", cursor: "pointer" };
}
const dmbField = { boxSizing: "border-box", padding: "7px 9px", borderRadius: 4, border: "1px solid rgba(242,237,228,0.16)", background: "rgba(242,237,228,0.04)", color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, outline: "none" };
const dmbLabel = { fontFamily: DMB_MONO, fontSize: 7.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DMB_INK50, display: "block", marginBottom: 3 };

function dmbPhase(key) {
  return DashMeals.GOAL_PHASES.find((g) => g.key === key) || DashMeals.GOAL_PHASES[0];
}

// ── Draft persistence (live API ⇄ localStorage) ─────────────────────────────
const DMB_DRAFT_KEY = "shape.dashMealDrafts";
function dmbWriteDraft(id, name, doc) {
  try {
    const all = JSON.parse(localStorage.getItem(DMB_DRAFT_KEY) || "{}");
    all[id] = { name, doc, at: Date.now() };
    localStorage.setItem(DMB_DRAFT_KEY, JSON.stringify(all));
  } catch (e) {}
}

// ── Food picker popover — search is FILTERED by the plan's constraints ──────
function DmbFoodPicker({ constraints, onPick, onClose }) {
  const [q, setQ] = React.useState("");
  const results = DashMeals.searchFoods(q, constraints);
  const excluded = (constraints && constraints.exclusions || []).length;
  return (
    <div style={{ position: "absolute", zIndex: 60, top: "100%", left: 0, marginTop: 6, width: 360, background: "#14110e", border: "1px solid rgba(242,237,228,0.16)", borderRadius: 8, boxShadow: "0 18px 48px rgba(0,0,0,0.5)", padding: 10 }}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} placeholder="Search foods & recipes…" style={{ ...dmbField, width: "100%", marginBottom: 6 }} />
      {(excluded > 0 || (constraints && constraints.maxPrep != null)) && (
        <div style={{ fontFamily: DMB_MONO, fontSize: 8, letterSpacing: "0.08em", color: DMB_GOLD, marginBottom: 6 }}>
          FILTERED · {[excluded ? "no " + constraints.exclusions.join(", ") : null, constraints.maxPrep != null ? "≤" + constraints.maxPrep + " min prep" : null].filter(Boolean).join(" · ")}
        </div>
      )}
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {results.map((f) => (
          <button key={f.id} onClick={() => onPick(f)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: 0, borderTop: "1px solid rgba(242,237,228,0.05)", padding: "8px 4px", cursor: "pointer", color: "#f2ede4" }}>
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{f.name}</span>
            <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.04em", color: DMB_INK50 }}>{f.kcal} kcal · {f.p}P{f.prepMin != null ? " · " + f.prepMin + "m" : ""}</span>
          </button>
        ))}
        {!results.length && <div style={{ fontSize: 12, color: DMB_INK50, padding: 8 }}>No match inside the plan's constraints.</div>}
      </div>
    </div>
  );
}

// ── Meal row editor — macros, slot, and the swap group (≤3 alternates) ──────
function DmbMealRow({ meal, onChange, onRemove, constraints, followers, badge }) {
  const [swapPicker, setSwapPicker] = React.useState(false);
  const set = (k, v) => onChange({ ...meal, [k]: v });
  const num = (k) => (e) => set(k, Math.max(0, Number(e.target.value) || 0));
  return (
    <div style={{ border: "1px solid rgba(242,237,228,0.08)", borderLeft: "3px solid " + (badge ? badge.c : "rgba(242,237,228,0.16)"), borderRadius: 4, padding: "9px 11px", marginBottom: 7, background: "rgba(242,237,228,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
        <select value={meal.slot} onChange={(e) => set("slot", e.target.value)} style={{ ...dmbField, fontFamily: DMB_MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DMB_GOLD, padding: "5px 7px" }}>
          {DashMeals.SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={meal.name} onChange={(e) => set("name", e.target.value)} style={{ ...dmbField, flex: 1, minWidth: 150, fontWeight: 500 }} />
        {badge && <DashPill c={badge.c}>{badge.label}</DashPill>}
        {followers && <span title="The rest/travel variants currently follow this meal — your next edit asks whether they should keep up" style={{ fontFamily: DMB_MONO, fontSize: 7.5, letterSpacing: "0.06em", color: DMB_INK50 }}>VARIANTS FOLLOW</span>}
        <button onClick={onRemove} aria-label="Remove meal" style={{ ...dmbBtn(false), padding: "4px 8px", color: DMB_RED, borderColor: "rgba(224,100,75,0.4)" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 76px)", gap: 8 }}>
        <div><span style={dmbLabel}>kcal</span><input type="number" value={meal.kcal} onChange={num("kcal")} style={{ ...dmbField, width: "100%" }} /></div>
        <div><span style={dmbLabel}>Protein g</span><input type="number" value={meal.p} onChange={num("p")} style={{ ...dmbField, width: "100%" }} /></div>
        <div><span style={dmbLabel}>Carbs g</span><input type="number" value={meal.c} onChange={num("c")} style={{ ...dmbField, width: "100%" }} /></div>
        <div><span style={dmbLabel}>Fat g</span><input type="number" value={meal.f} onChange={num("f")} style={{ ...dmbField, width: "100%" }} /></div>
        <div><span style={dmbLabel}>Prep</span><div style={{ fontFamily: DMB_MONO, fontSize: 10.5, color: DMB_INK50, paddingTop: 8 }}>{meal.prepMin != null ? meal.prepMin + " min" : "—"}</div></div>
      </div>
      {/* Swap group — approved alternates; the client's ⇄ chip cycles these */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: DMB_MONO, fontSize: 7.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DMB_INK50 }}>Swaps</span>
        {(meal.swaps || []).map((s, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: DMB_MONO, fontSize: 8.5, color: "#f2ede4", border: "1px solid rgba(216,162,58,0.35)", borderRadius: 4, padding: "4px 8px" }}>
            ⇄ {s.name} <span style={{ color: DMB_INK50 }}>{s.kcal} kcal</span>
            <button onClick={() => set("swaps", meal.swaps.filter((_, j) => j !== i))} aria-label={"Remove alternate " + s.name} style={{ background: "transparent", border: 0, color: DMB_RED, cursor: "pointer", padding: 0, fontSize: 11 }}>×</button>
          </span>
        ))}
        {(meal.swaps || []).length < 3 && (
          <span style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setSwapPicker(!swapPicker)} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8 }}>+ Alternate</button>
            {swapPicker && (
              <DmbFoodPicker constraints={constraints}
                onPick={(f) => { set("swaps", [...(meal.swaps || []), { name: f.name, kcal: f.kcal, p: f.p, c: f.c, f: f.f }]); setSwapPicker(false); }}
                onClose={() => setSwapPicker(false)} />
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Running macro bar — same red-when-over treatment as the client ledger ───
function DmbTotalsBar({ meals, targets, warnings }) {
  const t = DashMeals.mealsTotals(meals);
  return (
    <div style={{ marginBottom: 12 }}>
      {[["Calories", t.kcal, targets.kcal, "#2ee0c4"], ["Protein", t.p, targets.p, "#7ed4ff"], ["Carbs", t.c, targets.c, "#f6c177"], ["Fat", t.f, targets.f, "#ff8a6d"]].map(([l, v, tgt, c2]) => {
        const over = v > tgt;
        return (
          <div key={l} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 10, alignItems: "center", padding: "3px 0" }}>
            <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DMB_INK50 }}>{l}</span>
            <div style={{ position: "relative", height: 5, background: "rgba(242,237,228,0.08)", borderRadius: 2 }}>
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.min(100, Math.round((v / Math.max(1, tgt)) * 100)) + "%", background: over ? DMB_RED : c2, borderRadius: 2, transition: "width .25s ease, background .25s ease" }} />
            </div>
            <span style={{ fontFamily: DMB_MONO, fontSize: 10, whiteSpace: "nowrap", color: over ? DMB_RED : undefined }}>{Math.round(v)}<span style={{ color: DMB_INK50 }}>/{tgt}{l === "Calories" ? "" : "g"}</span></span>
          </div>
        );
      })}
      {(warnings || []).map((w, i) => (
        <div key={i} style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DMB_RED, marginTop: 5 }}>⚠ {w}</div>
      ))}
    </div>
  );
}

// ── Day editor with first-class variant tabs ────────────────────────────────
// Controlled: the builder owns the variant selection so the running macro bar
// and the client preview always show the SAME resolved day as the editor.
function DmbDayEditor({ day, onChange, plan, variant, setVariant }) {
  const [picker, setPicker] = React.useState(false);
  const applyDecisions = React.useRef({}); // mealId → true once "apply to variants" accepted
  const hasVariant = (k) => !!(day.variants && day.variants[k]);
  const activeVariants = DashMeals.VARIANT_KEYS.filter((v) => v.key === "training" || hasVariant(v.key));
  const addable = DashMeals.VARIANT_KEYS.filter((v) => v.key !== "training" && !hasVariant(v.key));
  const cur = variant === "training" || hasVariant(variant) ? variant : "training";

  // Editing the BASE while variants still follow → ask once per meal whether
  // the edit flows into them. Declining freezes the approved old meal into
  // each variant (core semantics), so later edits stop asking.
  const editBase = (mealId, next) => {
    let apply = true;
    if (DashMeals.hasVariantFollowers(day, mealId) && !applyDecisions.current[mealId]) {
      apply = window.confirm("This day has rest/travel variants that currently follow this meal.\n\nOK — apply this edit to the variants too.\nCancel — variants keep the current version of the meal.");
      if (apply) applyDecisions.current[mealId] = true;
    }
    onChange(DashMeals.editBaseMeal(day, mealId, next, apply));
  };
  const setVariantData = (k, v) => onChange({ ...day, variants: { ...(day.variants || {}), [k]: v } });

  const vdata = cur !== "training" ? day.variants[cur] : null;
  const tabBtn = (on) => ({ ...dmbBtn(false), padding: "6px 11px", color: on ? DMB_GOLD : "rgba(242,237,228,0.7)", borderColor: on ? "rgba(216,162,58,0.45)" : "rgba(242,237,228,0.18)" });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <span style={dmbLabel}>Day name</span>
          <input value={day.name} onChange={(e) => onChange({ ...day, name: e.target.value })} style={{ ...dmbField, width: "100%", fontSize: 14 }} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {activeVariants.map((v) => (
            <span key={v.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setVariant(v.key)} style={tabBtn(cur === v.key)}>{v.label}</button>
              {v.key !== "training" && cur === v.key && (
                <button onClick={() => { const nv = { ...(day.variants || {}) }; delete nv[v.key]; onChange({ ...day, variants: nv }); setVariant("training"); }} aria-label={"Delete " + v.label + " variant"} title="Delete this variant" style={{ ...dmbBtn(false), padding: "6px 8px", color: DMB_RED, borderColor: "rgba(224,100,75,0.4)" }}>×</button>
              )}
            </span>
          ))}
          {addable.map((v) => (
            <button key={v.key} onClick={() => { setVariantData(v.key, { overrides: {}, extras: [] }); setVariant(v.key); }} style={{ ...dmbBtn(false), padding: "6px 11px", fontSize: 8 }}>+ {v.label}</button>
          ))}
        </div>
      </div>

      {cur === "training" ? (
        <React.Fragment>
          {day.slots.map((m) => (
            <DmbMealRow key={m.id} meal={m} constraints={plan.constraints}
              followers={DashMeals.hasVariantFollowers(day, m.id)}
              onChange={(next) => editBase(m.id, next)}
              onRemove={() => onChange({ ...day, slots: day.slots.filter((x) => x.id !== m.id) })} />
          ))}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPicker(!picker)} style={dmbBtn(false)}>+ Meal</button>
            {picker && (
              <DmbFoodPicker constraints={plan.constraints}
                onPick={(f) => { onChange({ ...day, slots: [...day.slots, DashMeals.newMeal(f, day.slots.length === 0 ? "Breakfast" : "Lunch")] }); setPicker(false); }}
                onClose={() => setPicker(false)} />
            )}
          </div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DMB_INK50, marginBottom: 10 }}>
            Overlay on the training day — meals follow the base until you override or remove them here. Nothing is copied.
          </div>
          {day.slots.map((m) => {
            const hasOv = vdata.overrides && Object.prototype.hasOwnProperty.call(vdata.overrides, m.id);
            const ov = hasOv ? vdata.overrides[m.id] : undefined;
            if (hasOv && ov === null) {
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px dashed rgba(242,237,228,0.14)", borderRadius: 4, padding: "9px 11px", marginBottom: 7, color: DMB_INK50 }}>
                  <span style={{ fontSize: 12.5, textDecoration: "line-through" }}>{m.slot} · {m.name}</span>
                  <span style={{ fontFamily: DMB_MONO, fontSize: 8, letterSpacing: "0.08em" }}>REMOVED ON THIS DAY</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { const o = { ...vdata.overrides }; delete o[m.id]; setVariantData(cur, { ...vdata, overrides: o }); }} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8 }}>Restore</button>
                </div>
              );
            }
            if (hasOv) {
              return (
                <DmbMealRow key={m.id} meal={ov} constraints={plan.constraints} badge={{ label: "Overridden", c: DMB_GOLD }}
                  onChange={(next) => setVariantData(cur, { ...vdata, overrides: { ...vdata.overrides, [m.id]: { ...next, id: m.id } } })}
                  onRemove={() => setVariantData(cur, { ...vdata, overrides: { ...vdata.overrides, [m.id]: null } })} />
              );
            }
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(242,237,228,0.08)", borderLeft: "3px solid rgba(242,237,228,0.16)", borderRadius: 4, padding: "9px 11px", marginBottom: 7 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DMB_GOLD }}>{m.slot}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 10 }}>{m.name}</span>
                  <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50, marginLeft: 10 }}>{m.kcal} kcal · follows base</span>
                </div>
                <button onClick={() => setVariantData(cur, { ...vdata, overrides: { ...(vdata.overrides || {}), [m.id]: { ...JSON.parse(JSON.stringify(m)) } } })} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8 }}>Override</button>
                <button onClick={() => setVariantData(cur, { ...vdata, overrides: { ...(vdata.overrides || {}), [m.id]: null } })} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8, color: DMB_RED, borderColor: "rgba(224,100,75,0.4)" }}>Remove</button>
              </div>
            );
          })}
          {(vdata.extras || []).map((m, i) => (
            <DmbMealRow key={m.id} meal={m} constraints={plan.constraints} badge={{ label: "This day only", c: "#2ee0c4" }}
              onChange={(next) => setVariantData(cur, { ...vdata, extras: vdata.extras.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => setVariantData(cur, { ...vdata, extras: vdata.extras.filter((_, j) => j !== i) })} />
          ))}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPicker(!picker)} style={dmbBtn(false)}>+ Meal on this day</button>
            {picker && (
              <DmbFoodPicker constraints={plan.constraints}
                onPick={(f) => { setVariantData(cur, { ...vdata, extras: [...(vdata.extras || []), DashMeals.newMeal(f, "Snack")] }); setPicker(false); }}
                onClose={() => setPicker(false)} />
            )}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ── Grocery panel — auto-built, editable; edits ride the assignment ─────────
function DmbGroceryPanel({ plan, edits, onEdits }) {
  const out = React.useMemo(() => DashMeals.buildMealAssignment(plan, { scale: 1, groceryEdits: edits && Object.keys(edits).length ? edits : null }), [JSON.stringify(plan), JSON.stringify(edits)]);
  const auto = React.useMemo(() => DashMeals.buildMealAssignment(plan, { scale: 1 }), [JSON.stringify(plan)]);
  const key = (g) => (g.name + "|" + (g.unit || "")).toLowerCase();
  const removedKeys = Object.keys(edits || {}).filter((k) => edits[k] && edits[k].remove);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="dash-eyebrow" style={{ color: DMB_GOLD }}>Grocery · auto-built weekly</span>
        {removedKeys.length > 0 || Object.keys(edits || {}).length > 0
          ? <button onClick={() => onEdits({})} style={{ ...dmbBtn(false), padding: "3px 8px", fontSize: 8 }}>Reset edits</button>
          : <span style={{ fontFamily: DMB_MONO, fontSize: 8, color: DMB_INK50 }}>{out.grocery.length} items</span>}
      </div>
      <div className="dash-ledger" style={{ "--dac": DMB_GOLD, marginTop: 9 }} />
      <div style={{ maxHeight: 300, overflowY: "auto" }}>
        {out.grocery.map((g) => (
          <div key={key(g)} style={{ display: "grid", gridTemplateColumns: "1fr 86px auto", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{g.name}</div>
              <div style={{ fontFamily: DMB_MONO, fontSize: 8, color: DMB_INK50, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.meals.join(" · ")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="number" value={g.qty} onChange={(e) => {
                const v = Number(e.target.value);
                if (!isFinite(v) || v <= 0) return;
                onEdits({ ...(edits || {}), [key(g)]: { qty: v } });
              }} style={{ ...dmbField, width: 58, padding: "4px 6px", fontSize: 11 }} />
              <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>{g.unit || "×"}</span>
            </div>
            <button onClick={() => onEdits({ ...(edits || {}), [key(g)]: { remove: true } })} aria-label={"Remove " + g.name} style={{ ...dmbBtn(false), padding: "3px 7px", color: DMB_RED, borderColor: "rgba(224,100,75,0.4)" }}>×</button>
          </div>
        ))}
        {removedKeys.map((k) => {
          const src = auto.grocery.find((g) => key(g) === k);
          if (!src) return null;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(242,237,228,0.05)", color: DMB_INK50 }}>
              <span style={{ fontSize: 12, textDecoration: "line-through", flex: 1 }}>{src.name}</span>
              <button onClick={() => { const next = { ...(edits || {}) }; delete next[k]; onEdits(next); }} style={{ ...dmbBtn(false), padding: "3px 8px", fontSize: 8 }}>Restore</button>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: DMB_MONO, fontSize: 8, letterSpacing: "0.04em", color: DMB_INK50, marginTop: 8, lineHeight: 1.5 }}>
        Edits flow through the meals' ingredients on assignment, so the client's auto-grocery matches this list.
      </div>
    </div>
  );
}

// ── Assign modal — per-client portion scale + training days + start date ────
function DmbAssignModal({ template, doc, groceryEdits, clients, queue, lifecycle, live, preselectId, onClose }) {
  const [picked, setPicked] = React.useState(() => (preselectId ? { [preselectId]: true } : {}));
  const [scales, setScales] = React.useState({});
  const [startDate, setStartDate] = React.useState(() => {
    const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // next Monday
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  const [trainingDows, setTrainingDows] = React.useState({ 0: true, 2: true, 4: true });
  const [state, setState] = React.useState("");
  const queueState = (id) => { const q = (queue || []).find((r) => r.client.profile.id === id); return q ? q.state : null; };
  const lcBadge = (id) => {
    if (!lifecycle) return null;
    if (lifecycle.expiring.some((c) => c.profile.id === id)) return { label: "Expiring", c: DMB_RED };
    if (lifecycle.phaseChange.some((c) => c.profile.id === id)) return { label: "Phase change", c: DMB_GOLD };
    if (lifecycle.intake.some((c) => c.profile.id === id)) return { label: "Intake pending", c: "#2ee0c4" };
    return null;
  };
  const ids = Object.keys(picked).filter((k) => picked[k]);
  const dows = Object.keys(trainingDows).filter((k) => trainingDows[k]).map(Number);
  const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const assign = async () => {
    if (!ids.length || state === "working" || state === "done") return;
    setState("working");
    try {
      for (const id of ids) {
        const scale = Number(scales[id]) > 0 ? Number(scales[id]) : 1;
        const out = DashMeals.buildMealAssignment(doc, { scale, trainingDows: dows, groceryEdits: groceryEdits && Object.keys(groceryEdits).length ? groceryEdits : null });
        if (live) {
          const res = await fetch("/api/nutritionist/meal-plan", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: id, title: template.name + (scale !== 1 ? " · ×" + scale : ""), weekStart: startDate, days: out.days }),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
        }
      }
      // Plan written → those clients leave the plan queue for this week.
      try {
        const m = new Date(); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
        const key = "shape.dashQueueDone." + m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0") + "-" + String(m.getDate()).padStart(2, "0");
        const done = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
        ids.forEach((id) => done.add(id));
        localStorage.setItem(key, JSON.stringify([...done]));
      } catch (e) {}
      setState("done");
      setTimeout(onClose, 1100);
    } catch (e) { setState("error"); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.65)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(480px, 94vw)", maxHeight: "86vh", overflowY: "auto", background: "#14110e", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 10, padding: 22, color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ fontFamily: DMB_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DMB_GOLD }}>Assign · {template.name}</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 23, margin: "6px 0 4px" }}>Put clients on it.</div>
        <div style={{ fontSize: 12, color: DMB_INK50, marginBottom: 14 }}>{doc.days.length} day rotation · {doc.targets.kcal} kcal base · snapshot v{doc.version} — your later template edits won't change what they get.</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <span style={dmbLabel}>Week start</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={dmbField} />
          </div>
          <div>
            <span style={dmbLabel}>Training days · base meals (others get the rest variant)</span>
            <div style={{ display: "flex", gap: 4 }}>
              {DOW_LABELS.map((l, i) => (
                <button key={l} onClick={() => setTrainingDows({ ...trainingDows, [i]: !trainingDows[i] })} style={{ ...dmbBtn(false), padding: "5px 7px", fontSize: 8, color: trainingDows[i] ? DMB_GOLD : "rgba(242,237,228,0.55)", borderColor: trainingDows[i] ? "rgba(216,162,58,0.45)" : "rgba(242,237,228,0.18)" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <span style={dmbLabel}>Clients · portion scale never edits the template</span>
        <div style={{ maxHeight: 230, overflowY: "auto", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 6, padding: "2px 10px", marginBottom: 14 }}>
          {clients.map((c) => {
            const id = c.profile.id;
            const qs = queueState(id);
            const lb = lcBadge(id);
            return (
              <label key={id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(242,237,228,0.05)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!picked[id]} onChange={(e) => setPicked({ ...picked, [id]: e.target.checked })} />
                <span style={{ fontSize: 13 }}>{c.profile.name}</span>
                {lb ? <DashPill c={lb.c}>{lb.label}</DashPill> : qs ? <DashPill c={qs === "ready" ? "#2ee0c4" : DMB_GOLD}>{qs === "ready" ? "Ready" : "Awaiting check-in"}</DashPill> : <span />}
                {picked[id] ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontFamily: DMB_MONO, fontSize: 7.5, color: DMB_INK50 }}>×</span>
                    <input type="number" step="0.1" min="0.5" max="2" value={scales[id] != null ? scales[id] : 1}
                      onClick={(e) => e.preventDefault()}
                      onChange={(e) => setScales({ ...scales, [id]: e.target.value })}
                      style={{ ...dmbField, width: 52, padding: "4px 6px", fontSize: 11 }} />
                  </span>
                ) : <span />}
              </label>
            );
          })}
          {!clients.length && <div style={{ fontSize: 12, color: DMB_INK50, padding: 8 }}>No clients loaded.</div>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={assign} disabled={!ids.length || state === "working"} style={{ ...dmbBtn(true), padding: "11px 18px", opacity: !ids.length || state === "working" ? 0.6 : 1 }}>
            {state === "working" ? "Assigning…" : state === "done" ? "Assigned ✓" : "Publish to " + (ids.length || 0) + " client" + (ids.length === 1 ? "" : "s")}
          </button>
          <button onClick={onClose} style={dmbBtn(false)}>Cancel</button>
          {state === "error" && <span style={{ fontFamily: DMB_MONO, fontSize: 9, color: DMB_RED }}>Couldn't assign — try again</span>}
          {!live && <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>DEMO · marks the queue only</span>}
        </div>
      </div>
    </div>
  );
}

// ── Client preview — the EXACT meals + ledger card the client dashboard
// renders, playable: log meals, watch the ledger tick, swap alternates. ─────
function DmbClientPreview({ doc, day, variant }) {
  const meals = React.useMemo(() => DashMeals.resolveDay(day, variant).map((m, i) => ({
    id: m.id || "pv-" + i, slot: m.slot, time: null, title: m.name,
    kcal: m.kcal, p: m.p, c: m.c, f: m.f, alts: m.swaps || [],
  })), [JSON.stringify(day), variant]);
  const [ledger, setLedger] = React.useState({ kcal: 0, p: 0, c: 0, f: 0 });
  const [logged, setLogged] = React.useState({});
  const reset = () => { setLedger({ kcal: 0, p: 0, c: 0, f: 0 }); setLogged({}); };
  React.useEffect(reset, [JSON.stringify(day), variant]);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DMB_INK50 }}>Client preview · their meals card</span>
        <button onClick={reset} style={{ ...dmbBtn(false), padding: "3px 8px", fontSize: 8 }}>Reset day</button>
      </div>
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "#2ee0c4", paddingLeft: 24 }}>
        <DashMealLedgerCard
          meals={meals} targets={doc.targets} ledger={ledger} logged={logged}
          onLog={(m) => {
            if (logged[m.id]) return;
            setLogged({ ...logged, [m.id]: true });
            setLedger((l) => ({ kcal: l.kcal + (m.kcal || 0), p: l.p + (m.p || 0), c: l.c + (m.c || 0), f: l.f + (m.f || 0) }));
          }}
          headerNote={variant === "training" ? "training day" : variant + " day"}
        />
      </div>
    </div>
  );
}

// ── The builder ─────────────────────────────────────────────────────────────
function DmbBuilder({ template, clients, queue, lifecycle, live, onBack, onSaved, assignClientId }) {
  const [name, setName] = React.useState(template.name);
  const [doc, setDoc] = React.useState(() => JSON.parse(JSON.stringify(template.detail.mealBuilder)));
  const [sel, setSel] = React.useState(0);
  const [previewVariant, setPreviewVariant] = React.useState("training");
  const [preview, setPreview] = React.useState(true);
  const [saveState, setSaveState] = React.useState("saved");
  const [assigning, setAssigning] = React.useState(!!assignClientId);
  const idRef = React.useRef(template.id);

  // Autosave (debounced): live → /api/coach/plans, else localStorage drafts.
  React.useEffect(() => {
    setSaveState("dirty");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        if (live) {
          if (idRef.current && !String(idRef.current).startsWith("demo-")) {
            const res = await fetch("/api/coach/plans", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idRef.current, name, detail: { ...(template.detail || {}), mealBuilder: doc } }) });
            if (!res.ok) throw new Error("save failed");
          } else {
            const res = await fetch("/api/coach/plans", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "meal_plan", name, meta: doc.targets.kcal + " kcal · " + dmbPhase(doc.goalPhase).label, detail: { mealBuilder: doc } }) });
            const d = await res.json();
            if (d && d.plan && d.plan.id) idRef.current = d.plan.id;
            else if (d && d.id) idRef.current = d.id;
          }
        } else {
          dmbWriteDraft(idRef.current || "draft-" + Date.now().toString(36), name, doc);
        }
        setSaveState("saved");
        onSaved && onSaved({ id: idRef.current, name, doc });
      } catch (e) { setSaveState("error"); }
    }, 1200);
    return () => clearTimeout(t);
  }, [doc, name]);

  const day = doc.days[sel];
  const setDay = (next) => setDoc({ ...doc, days: doc.days.map((d, i) => (i === sel ? next : d)) });
  const setTargets = (k, v) => setDoc({ ...doc, targets: { ...doc.targets, [k]: Math.max(0, Number(v) || 0) } });
  const setConstraint = (k, v) => setDoc({ ...doc, constraints: { ...doc.constraints, [k]: v } });
  const duplicateDay = (i) => {
    const copy = JSON.parse(JSON.stringify(doc.days[i]));
    copy.name = copy.name + " copy";
    // Fresh meal ids so variant override keys stay distinct per day.
    const remap = {};
    copy.slots = copy.slots.map((m) => { const nid = "m" + Math.random().toString(36).slice(2, 9); remap[m.id] = nid; return { ...m, id: nid }; });
    Object.keys(copy.variants || {}).forEach((k) => {
      const v = copy.variants[k];
      const ov = {};
      Object.keys(v.overrides || {}).forEach((oid) => { if (remap[oid]) ov[remap[oid]] = v.overrides[oid] ? { ...v.overrides[oid], id: remap[oid] } : null; });
      v.overrides = ov;
    });
    setDoc({ ...doc, days: [...doc.days.slice(0, i + 1), copy, ...doc.days.slice(i + 1)] });
  };
  const shift = (deltas) => setDoc(DashMeals.phaseShift(doc, deltas));

  // The running bar measures the SAME resolved day+variant the preview shows.
  // Guard: switching to a day without the selected variant falls back to base.
  const curVariant = previewVariant === "training" || (day && day.variants && day.variants[previewVariant]) ? previewVariant : "training";
  const resolved = day ? DashMeals.resolveDay(day, curVariant) : [];
  const warnings = day ? DashMeals.checkConstraints(doc, resolved) : [];
  const phase = dmbPhase(doc.goalPhase);
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved edits…" : saveState === "error" ? "Save failed — retrying on next edit" : live ? "Saved" : "Draft saved locally";
  const EXCLUSION_TAGS = ["dairy", "gluten", "nuts", "shellfish", "fish", "egg", "soy"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={onBack} style={dmbBtn(false)}>← Library</button>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...dmbField, fontSize: 16, fontWeight: 500, minWidth: 220 }} />
        <select value={doc.goalPhase} onChange={(e) => {
          const p = dmbPhase(e.target.value);
          setDoc({ ...doc, goalPhase: p.key, targets: { ...p.targets }, constraints: { ...doc.constraints, proteinFloor: p.targets.p - 20 } });
        }} style={{ ...dmbField, fontFamily: DMB_MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: phase.c, padding: "6px 8px" }}>
          {DashMeals.GOAL_PHASES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>v{doc.version} · {saveLabel}</span>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DMB_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: preview ? "#2ee0c4" : DMB_INK50, cursor: "pointer" }}>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Client preview
        </label>
        <button onClick={() => setDoc({ ...doc, version: (doc.version || 1) + 1 })} title="Bump the template version — assignments stamp the version they were sent from" style={dmbBtn(false)}>Publish v{(doc.version || 1) + 1}</button>
        <button onClick={() => setAssigning(true)} style={dmbBtn(true)}>Assign to clients →</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: preview ? "240px 1fr 360px" : "240px 1fr", gap: 16, alignItems: "start" }}>
        {/* Left — targets first, then constraints, days, week tools */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="dash-plate dash-plate--tick" style={{ "--dac": phase.c, paddingLeft: 22 }}>
            <div className="dash-eyebrow" style={{ color: phase.c }}>Targets · set these first</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              {[["kcal", "kcal"], ["p", "Protein g"], ["c", "Carbs g"], ["f", "Fat g"]].map(([k, l]) => (
                <div key={k}><span style={dmbLabel}>{l}</span><input type="number" value={doc.targets[k]} onChange={(e) => setTargets(k, e.target.value)} style={{ ...dmbField, width: "100%" }} /></div>
              ))}
            </div>
          </div>

          <div className="dash-plate" style={{ "--dac": DMB_GOLD, padding: "14px 16px" }}>
            <div className="dash-eyebrow" style={{ color: DMB_GOLD }}>Constraints · filter the food search</div>
            <div style={{ marginTop: 10 }}>
              <span style={dmbLabel}>Protein floor (g/day)</span>
              <input type="number" value={doc.constraints.proteinFloor != null ? doc.constraints.proteinFloor : ""} placeholder="—"
                onChange={(e) => setConstraint("proteinFloor", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))} style={{ ...dmbField, width: 90 }} />
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={dmbLabel}>Allergies & exclusions</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {EXCLUSION_TAGS.map((tag) => {
                  const on = (doc.constraints.exclusions || []).indexOf(tag) >= 0;
                  return (
                    <button key={tag} onClick={() => setConstraint("exclusions", on ? doc.constraints.exclusions.filter((t) => t !== tag) : [...(doc.constraints.exclusions || []), tag])}
                      style={{ ...dmbBtn(false), padding: "4px 8px", fontSize: 8, color: on ? DMB_RED : "rgba(242,237,228,0.55)", borderColor: on ? "rgba(224,100,75,0.45)" : "rgba(242,237,228,0.18)" }}>
                      {on ? "× " : ""}{tag}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={dmbLabel}>Max prep (min)</span>
              <input type="number" value={doc.constraints.maxPrep != null ? doc.constraints.maxPrep : ""} placeholder="—"
                onChange={(e) => setConstraint("maxPrep", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))} style={{ ...dmbField, width: 90 }} />
            </div>
          </div>

          <div className="dash-plate" style={{ "--dac": DMB_GOLD, padding: "14px 16px" }}>
            <div className="dash-eyebrow" style={{ color: DMB_GOLD }}>Days · rotation</div>
            <div style={{ marginTop: 8 }}>
              {doc.days.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <button onClick={() => setSel(i)} style={{ flex: 1, textAlign: "left", cursor: "pointer", border: "1px solid " + (sel === i ? DMB_GOLD : "rgba(242,237,228,0.1)"), borderLeft: "3px solid " + (sel === i ? DMB_GOLD : "rgba(242,237,228,0.18)"), background: sel === i ? "rgba(216,162,58,0.1)" : "transparent", color: "#f2ede4", borderRadius: 4, padding: "7px 9px", fontSize: 12.5 }}>
                    {d.name}
                    <span style={{ display: "block", fontFamily: DMB_MONO, fontSize: 8, color: DMB_INK50, marginTop: 2 }}>
                      {d.slots.length} meals · {DashMeals.mealsTotals(d.slots).kcal} kcal{Object.keys(d.variants || {}).length ? " · " + Object.keys(d.variants).length + " variant" + (Object.keys(d.variants).length === 1 ? "" : "s") : ""}
                    </span>
                  </button>
                  <button onClick={() => duplicateDay(i)} title="Duplicate day" style={{ ...dmbBtn(false), padding: "3px 7px", fontSize: 8 }}>⧉</button>
                  {doc.days.length > 1 && <button onClick={() => { setDoc({ ...doc, days: doc.days.filter((_, j) => j !== i) }); setSel(0); }} aria-label={"Delete " + d.name} style={{ ...dmbBtn(false), padding: "3px 7px", fontSize: 8, color: DMB_RED }}>×</button>}
                </div>
              ))}
              <button onClick={() => setDoc({ ...doc, days: [...doc.days, DashMeals.newDay("Day " + String.fromCharCode(65 + doc.days.length))] })} style={{ ...dmbBtn(false), marginTop: 4 }}>+ Day</button>
            </div>
          </div>

          <div className="dash-plate" style={{ "--dac": phase.c, padding: "14px 16px" }}>
            <div className="dash-eyebrow" style={{ color: phase.c }}>Phase shift · one step</div>
            <div style={{ fontSize: 11.5, color: DMB_INK50, lineHeight: 1.5, margin: "8px 0 10px" }}>Shifts every day, variant, and swap — kcal recompute from the macros.</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button onClick={() => shift({ carbsPct: -10 })} style={{ ...dmbBtn(false), padding: "5px 9px", fontSize: 8 }}>−10% carbs</button>
              <button onClick={() => shift({ carbsPct: 10 })} style={{ ...dmbBtn(false), padding: "5px 9px", fontSize: 8 }}>+10% carbs</button>
              <button onClick={() => shift({ proteinPct: 10 })} style={{ ...dmbBtn(false), padding: "5px 9px", fontSize: 8 }}>+10% protein</button>
              <button onClick={() => shift({ fatPct: -10 })} style={{ ...dmbBtn(false), padding: "5px 9px", fontSize: 8 }}>−10% fat</button>
            </div>
          </div>
        </div>

        {/* Middle — running bar + the day editor (one shared variant tab) */}
        <div className="dash-plate dash-plate--tick" style={{ "--dac": DMB_GOLD, paddingLeft: 24 }}>
          <span className="dash-eyebrow" style={{ color: DMB_GOLD }}>{day ? day.name : "Day"} · {curVariant === "training" ? "training day" : curVariant + " day"} · running total</span>
          <div className="dash-ledger" style={{ "--dac": DMB_GOLD, margin: "9px 0 10px" }} />
          <DmbTotalsBar meals={resolved} targets={doc.targets} warnings={warnings} />
          {day
            ? <DmbDayEditor day={day} onChange={setDay} plan={doc} variant={curVariant} setVariant={setPreviewVariant} />
            : <div style={{ color: DMB_INK50, fontSize: 13 }}>Pick a day on the left.</div>}
        </div>

        {/* Right — client preview (the literal card) + grocery */}
        {preview && (
          <div style={{ position: "sticky", top: 90, display: "flex", flexDirection: "column", gap: 14 }}>
            {day && <DmbClientPreview doc={doc} day={day} variant={curVariant} />}
            <div className="dash-plate" style={{ "--dac": DMB_GOLD, padding: "16px 18px" }}>
              <DmbGroceryPanel plan={doc} edits={doc.groceryEdits || {}} onEdits={(e) => setDoc({ ...doc, groceryEdits: e })} />
            </div>
          </div>
        )}
      </div>

      {assigning && (
        <DmbAssignModal
          template={{ id: idRef.current, name }} doc={doc} groceryEdits={doc.groceryEdits || {}}
          clients={clients} queue={queue} lifecycle={lifecycle} live={live}
          preselectId={assignClientId}
          onClose={() => setAssigning(false)} />
      )}
    </div>
  );
}

// ── Lifecycle zone — expiring / phase change / intake pending ───────────────
function DmbLifecyclePanel({ lifecycle, onWritePlan }) {
  const groups = [
    { key: "expiring", label: "Expiring this week", c: DMB_RED, sub: "Check-in reviewed — this week's plan isn't written yet", action: "Write plan" },
    { key: "phaseChange", label: "Ready for phase change", c: DMB_GOLD, sub: "At or past 50% to goal — consider the next phase's targets", action: "Write plan" },
    { key: "intake", label: "Intake pending", c: "#2ee0c4", sub: "No first check-in yet — chase the intake before assigning", action: null },
  ];
  return (
    <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DMB_GOLD, paddingLeft: 24 }}>
      <div className="dash-eyebrow" style={{ color: DMB_GOLD }}>Plan lifecycle · who needs one</div>
      <div className="dash-ledger" style={{ "--dac": DMB_GOLD, marginTop: 9 }} />
      <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {groups.map((g) => {
          const list = lifecycle[g.key] || [];
          return (
            <div key={g.key}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: DMB_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: g.c }}>{g.label}</span>
                <span style={{ fontFamily: DMB_MONO, fontSize: 9, color: DMB_INK50 }}>{list.length}</span>
              </div>
              <div style={{ fontSize: 11, color: DMB_INK50, lineHeight: 1.45, margin: "4px 0 8px" }}>{g.sub}</div>
              {list.map((c) => (
                <div key={c.profile.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.profile.name}</span>
                  {g.action
                    ? <button onClick={() => onWritePlan(c.profile.id)} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8 }}>{g.action} →</button>
                    : <button onClick={() => dashMessageClient(c.profile.name, "nutritionist", "Quick nudge — your intake form is still open. Two minutes and I can build your first week.")} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8 }}>Message</button>}
                </div>
              ))}
              {!list.length && <div style={{ fontSize: 11.5, color: DMB_INK50, padding: "6px 0" }}>Nobody — clear.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
function NutritionistPlansPage() {
  const { clients, queue, today: live, source } = useDashboard("nutritionist");
  const [templates, setTemplates] = React.useState(null);
  const [view, setView] = React.useState(null); // null = library, else { template, assignClientId? }
  const [phaseFilter, setPhaseFilter] = React.useState("all");
  const [assignFor, setAssignFor] = React.useState(null); // { template, clientId? }
  const isLive = !!live;
  const lifecycle = React.useMemo(() => DashMeals.buildPlanLifecycle(clients || [], queue || []), [clients, queue]);

  React.useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/plans?kind=meal_plan", { credentials: "same-origin" });
        if (!res.ok) throw new Error();
        const d = await res.json();
        const rows = (d.plans || d || []).filter((p) => p && p.detail && p.detail.mealBuilder);
        if (on) setTemplates(rows.length ? rows : DashMeals.demoMealTemplates());
      } catch (e) { if (on) setTemplates(DashMeals.demoMealTemplates()); }
    })();
    return () => { on = false; };
  }, []);

  const list = (templates || []).filter((t) => phaseFilter === "all" || t.detail.mealBuilder.goalPhase === phaseFilter);
  // "Write plan" from the lifecycle: pre-fill the assign modal with that
  // client on the matching-phase template (else the first one).
  const writePlanFor = (clientId) => {
    const c = (clients || []).find((x) => x.profile.id === clientId);
    const tpl = (templates || []).find((t) => c && c.goalPhase && t.detail.mealBuilder.goalPhase === c.goalPhase) || (templates || [])[0];
    if (tpl) setAssignFor({ template: tpl, clientId });
  };

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
      <DashPage
        tourHero="hero-plans"
        navItems={nutriNavItems("plans")}
        payoutCard={live
          ? { label: "MONTHLY · NET", amount: live.kpis.monthlyNetCents != null ? dashMoney(live.kpis.monthlyNetCents) : "—", sub: live.kpis.activeClients + " active subs · payouts connect soon" }
          : nutriPayoutCard}
        eyebrow={(templates ? templates.length : 0) + " TEMPLATES · BY GOAL PHASE"}
        title="Plans"
        subtitle={view ? "Editing — autosaves as you build; Assign publishes a scaled snapshot to the client's meals + grocery." : "Your meal-plan library and who needs a plan next. Assign pre-fills the plan queue."}
      >
        {view ? (
          <DmbBuilder
            template={view.template}
            clients={clients} queue={queue} lifecycle={lifecycle} live={isLive}
            assignClientId={view.assignClientId}
            onBack={() => setView(null)}
            onSaved={({ id, name, doc }) => {
              setTemplates((prev) => (prev || []).map((t) => (t === view.template || t.id === id ? { ...t, id: id || t.id, name, detail: { ...(t.detail || {}), mealBuilder: doc } } : t)));
            }}
          />
        ) : (
          <React.Fragment>
            {/* Zone 1 — Library */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              {[["all", "All"]].concat(DashMeals.GOAL_PHASES.map((g) => [g.key, g.label])).map(([k, l]) => (
                <button key={k} onClick={() => setPhaseFilter(k)} style={{ ...dmbBtn(false), color: phaseFilter === k ? DMB_GOLD : "rgba(242,237,228,0.7)", borderColor: phaseFilter === k ? "rgba(216,162,58,0.45)" : "rgba(242,237,228,0.18)" }}>{l}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={() => setView({ template: { id: null, name: "New meal plan", detail: { mealBuilder: DashMeals.newPlan("New meal plan", "maintain") } } })} style={dmbBtn(true)}>+ New meal plan</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14, marginBottom: 22 }}>
              {templates == null && <div style={{ color: DMB_INK50, fontSize: 13 }}>Loading templates…</div>}
              {list.map((t) => {
                const b = t.detail.mealBuilder;
                const ph = dmbPhase(b.goalPhase);
                const variants = b.days.reduce((s, d) => s + Object.keys(d.variants || {}).length, 0);
                return (
                  <div key={t.id || t.name} className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": ph.c, paddingLeft: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span className="dash-eyebrow" style={{ color: ph.c }}>{ph.label}</span>
                      <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>v{b.version}</span>
                    </div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 21, letterSpacing: "-0.015em", margin: "7px 0 3px" }}>{t.name}</div>
                    <div style={{ fontFamily: DMB_MONO, fontSize: 9, color: DMB_INK50 }}>{b.targets.kcal} kcal · {b.targets.p}P · {b.days.length}-day rotation{variants ? " · " + variants + " variant" + (variants === 1 ? "" : "s") : ""}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button onClick={() => setAssignFor({ template: t })} style={dmbBtn(true)}>Assign to client</button>
                      <button onClick={() => setView({ template: t })} style={dmbBtn(false)}>Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Zone 2 — Lifecycle */}
            <DmbLifecyclePanel lifecycle={lifecycle} onWritePlan={writePlanFor} />
          </React.Fragment>
        )}
      </DashPage>
      {assignFor && (
        <DmbAssignModal
          template={{ id: assignFor.template.id, name: assignFor.template.name }}
          doc={assignFor.template.detail.mealBuilder}
          groceryEdits={assignFor.template.detail.mealBuilder.groceryEdits || {}}
          clients={clients} queue={queue} lifecycle={lifecycle} live={isLive}
          preselectId={assignFor.clientId}
          onClose={() => setAssignFor(null)} />
      )}
    </React.Fragment>
  );
}

Object.assign(window, { NutritionistPlansPage, DmbBuilder, DmbAssignModal, DmbLifecyclePanel, DmbClientPreview, DmbTotalsBar });
