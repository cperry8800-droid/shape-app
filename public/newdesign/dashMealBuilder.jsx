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
// dashMealCore → dashFilterBar (the library's filters) → this file.

const DMB_INK50 = "var(--sh-ink2, #a09b94)";
const DMB_MONO = "'JetBrains Mono', monospace";
const DMB_GOLD = "var(--sh-gold, #d8a23a)";
const DMB_RED = "var(--sh-rust, #e0644b)";

function dmbBtn(primary, c) {
  const col = c || DMB_GOLD;
  return primary
    ? { fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 13, fontWeight: 600, minHeight: 36, color: "var(--sh-deep, #06231f)", background: col, border: 0, borderRadius: 4, padding: "8px 13px", cursor: "pointer" }
    : { fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 13, fontWeight: 600, minHeight: 36, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", background: "transparent", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 4, padding: "8px 13px", cursor: "pointer" };
}
const dmbField = { boxSizing: "border-box", padding: "7px 9px", borderRadius: 4, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.16)", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", color: "var(--sh-ink, #f2ede4)", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 12.5, outline: "none" };
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
    return true;
  } catch (e) { return false; }
}

// ── Food picker popover — search is FILTERED by the plan's constraints ──────
function DmbFoodPicker({ constraints, onPick, onClose, customFoods = [] }) {
  const [q, setQ] = React.useState("");
  const term = q.trim();
  const mine = DashMeals.searchCustomFoods(customFoods, term, constraints);
  const shape = DashMeals.searchFoods(term, constraints);
  // ⚠ THE PLAN'S CONSTRAINTS GATE THE CREATE OFFER TOO, and the gate is the SHIPPED
  // predicate run over the CANDIDATE — so the object that is tested is the object that
  // gets inserted, and there is no second copy of the rule to drift. Without it the picker
  // refused "Dairy bowl" from every list under a no-dairy plan and then offered to add it
  // on the next line: one screen contradicting itself, and an excluded food on a client's
  // plan. Only an exclusion can bite here — a new dish carries `prepMin: null`, which the
  // prep-time rule passes rather than guessing a time nobody measured.
  const candidate = term ? DashMeals.newCustomFood(term) : null;
  const nameFree = DashMeals.canCreateFood(term, customFoods);
  const canCreate = !!candidate && nameFree && DashMeals.searchCustomFoods([candidate], "", constraints).length === 1;
  // ⚠ AND A REFUSAL SAYS WHICH RULE REFUSED IT. A name that simply vanishes reads as the
  // feature being broken — the dead end this picker exists to remove, in a new coat.
  // ⚠ THE REFUSAL RENDERS WHETHER OR NOT IT CAN NAME THE RULE. Today only an exclusion
  // can reach here — a new dish carries `tags: []` and `prepMin: null`, so neither the tag
  // rule nor the prep rule can bite it — but keying the message on having FOUND the word
  // would go silent the day `newCustomFood` grows a default, which is the dead end again.
  const blocked = !!term && nameFree && !canCreate;
  const blockedBy = blocked
    ? ((constraints && constraints.exclusions) || []).find((t) => term.toLowerCase().indexOf(String(t).toLowerCase()) >= 0) || null
    : null;
  const excluded = (constraints && constraints.exclusions || []).length;
  const row = (f) => (
    <button key={f.id} onClick={() => onPick(f)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: 0, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)", padding: "8px 4px", cursor: "pointer", color: "var(--sh-ink, #f2ede4)" }}>
      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{f.name}</span>
      {/* ⚠ A DISH THE COACH HAS NAMED BUT NOT COSTED READS "Macros not set", never
          "0 kcal · 0P". Those two are different claims and only one of them is
          true: the zeros are the row editor's starting values, not a measurement,
          and printing them here states a figure nobody has taken. */}
      <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.04em", color: DMB_INK50 }}>
        {!DashMeals.foodHasMacros(f)
          ? "Macros not set"
          : <>{f.kcal} kcal · {f.p}P{f.prepMin != null ? " · " + f.prepMin + "m" : ""}</>}
      </span>
    </button>
  );
  const head = (t) => <div style={{ fontFamily: DMB_MONO, fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DMB_INK50, margin: "9px 0 2px", padding: "0 4px" }}>{t}</div>;
  return (
    <div style={{ position: "absolute", zIndex: 60, top: "100%", left: 0, marginTop: 6, width: "min(360px, calc(100vw - 72px))", background: "var(--sh-ground2, #14110e)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.16)", borderRadius: 8, boxShadow: "0 18px 48px rgba(0,0,0,0.5)", padding: 10 }}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // ⚠ WHILE AN IME IS COMPOSING, THE KEYSTROKES BELONG TO THE IME. The Enter that
          // confirms a candidate would otherwise also create a half-composed name, and the
          // Escape that cancels one would close the picker — which on the workout side
          // throws away every move ticked so far. Both are handed back to the IME.
          if (e.nativeEvent && e.nativeEvent.isComposing) return;
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && canCreate) { e.preventDefault(); onPick(candidate); }
        }}
        placeholder="Search foods & recipes…" style={{ ...dmbField, width: "100%", marginBottom: 6 }} />
      {(excluded > 0 || (constraints && constraints.maxPrep != null)) && (
        <div style={{ fontFamily: DMB_MONO, fontSize: 8, letterSpacing: "0.08em", color: DMB_GOLD, marginBottom: 6 }}>
          FILTERED · {[excluded ? "no " + constraints.exclusions.join(", ") : null, constraints.maxPrep != null ? "≤" + constraints.maxPrep + " min prep" : null].filter(Boolean).join(" · ")}
        </div>
      )}
      {/* ⚠ THE WAY OUT OF AN EMPTY SEARCH. This picker was the only route to a meal
          at all, so a dish Shape has never heard of could not be put on a plan
          except by picking something else and retyping it. The macros are left for
          the row editor rather than guessed here: nothing on this page may state a
          figure nobody measured. */}
      {blocked && (
        <div style={{ fontFamily: DMB_MONO, fontSize: 8.5, lineHeight: 1.5, letterSpacing: "0.05em", color: DMB_INK50, marginBottom: 6, padding: "6px 8px", borderRadius: 5, border: "1px dashed rgba(var(--sh-ink-rgb, 242,237,228),0.16)" }}>
          {blockedBy
            ? <>“{term}” carries “{blockedBy}”, which this plan excludes — it can’t go on this client’s plan.</>
            : <>“{term}” is outside this plan’s constraints, so it can’t go on this client’s plan.</>}
        </div>
      )}
      {canCreate && (
        <button onClick={() => onPick(candidate)}
          style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", minHeight: 34, marginBottom: 4, padding: "0 9px", borderRadius: 6, cursor: "pointer", textAlign: "left",
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--sh-accent-ink, #2ee0c4)", background: "rgba(var(--sh-accent-rgb, 46,224,196),0.08)", border: "1px dashed rgba(var(--sh-accent-rgb, 46,224,196),0.45)" }}>
          <span aria-hidden>＋</span> Add “{term}” — you set the macros
        </button>
      )}
      <div className="dash-thin-scroll" style={{ maxHeight: 260, overflowY: "auto" }}>
        {!!mine.length && head("Your foods")}
        {mine.map(row)}
        {!!shape.length && head("Shape library")}
        {shape.map(row)}
        {!mine.length && !shape.length && <div style={{ fontSize: 12, color: DMB_INK50, padding: 8 }}>No match inside the plan's constraints.</div>}
      </div>
    </div>
  );
}

// ── Meal row editor — macros, slot, and the swap group (≤3 alternates) ──────
function DmbMealRow({ meal, onChange, onRemove, constraints, followers, badge, customFoods }) {
  const [swapPicker, setSwapPicker] = React.useState(false);
  const set = (k, v) => onChange({ ...meal, [k]: v });
  const num = (k) => (e) => set(k, Math.max(0, Number(e.target.value) || 0));
  return (
    <div style={{ border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderLeft: "3px solid " + (badge ? badge.c : "rgba(var(--sh-ink-rgb, 242,237,228),0.16)"), borderRadius: 4, padding: "9px 11px", marginBottom: 7, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
        <select aria-label={meal.name + " meal slot"} value={meal.slot} onChange={(e) => set("slot", e.target.value)} style={{ ...dmbField, fontFamily: DMB_MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: DMB_GOLD, padding: "5px 7px" }}>
          {DashMeals.SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input aria-label="Meal name" value={meal.name} onChange={(e) => set("name", e.target.value)} style={{ ...dmbField, flex: 1, minWidth: 150, fontWeight: 500 }} />
        {badge && <DashPill c={badge.c}>{badge.label}</DashPill>}
        {followers && <span title="The rest/travel variants currently follow this meal — your next edit asks whether they should keep up" style={{ fontFamily: DMB_MONO, fontSize: 7.5, letterSpacing: "0.06em", color: DMB_INK50 }}>VARIANTS FOLLOW</span>}
        <button onClick={onRemove} aria-label="Remove meal" style={{ ...dmbBtn(false), padding: "4px 8px", color: DMB_RED, borderColor: "rgba(var(--sh-rust-rgb, 224,100,75),0.4)" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: 8 }}>
        <div><span style={dmbLabel}>kcal</span><input aria-label={meal.name + " Calories"} type="number" value={meal.kcal} onChange={num("kcal")} style={{ ...dmbField, width: "100%" }} /></div>
        <div><span style={dmbLabel}>Protein g</span><input aria-label={meal.name + " Protein g"} type="number" value={meal.p} onChange={num("p")} style={{ ...dmbField, width: "100%" }} /></div>
        <div><span style={dmbLabel}>Carbs g</span><input aria-label={meal.name + " Carbs g"} type="number" value={meal.c} onChange={num("c")} style={{ ...dmbField, width: "100%" }} /></div>
        <div><span style={dmbLabel}>Fat g</span><input aria-label={meal.name + " Fat g"} type="number" value={meal.f} onChange={num("f")} style={{ ...dmbField, width: "100%" }} /></div>
        <div><span style={dmbLabel}>Prep</span><div style={{ fontFamily: DMB_MONO, fontSize: 10.5, color: DMB_INK50, paddingTop: 8 }}>{meal.prepMin != null ? meal.prepMin + " min" : "—"}</div></div>
      </div>
      {/* Swap group — approved alternates; the client's ⇄ chip cycles these */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: DMB_MONO, fontSize: 7.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DMB_INK50 }}>Swaps</span>
        {(meal.swaps || []).map((s, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: DMB_MONO, fontSize: 8.5, color: "var(--sh-ink, #f2ede4)", border: "1px solid rgba(var(--sh-gold-rgb, 216,162,58),0.35)", borderRadius: 4, padding: "4px 8px" }}>
            ⇄ {s.name} <span style={{ color: DMB_INK50 }}>{s.kcal} kcal</span>
            <button onClick={() => set("swaps", meal.swaps.filter((_, j) => j !== i))} aria-label={"Remove alternate " + s.name} style={{ background: "transparent", border: 0, color: DMB_RED, cursor: "pointer", padding: 0, fontSize: 11 }}>×</button>
          </span>
        ))}
        {(meal.swaps || []).length < 3 && (
          <span style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setSwapPicker(!swapPicker)} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8 }}>+ Alternate</button>
            {swapPicker && (
              <DmbFoodPicker constraints={constraints} customFoods={customFoods}
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
      {[["Calories", t.kcal, targets.kcal, "var(--sh-accent, #2ee0c4)"], ["Protein", t.p, targets.p, "#7ed4ff"], ["Carbs", t.c, targets.c, "#f6c177"], ["Fat", t.f, targets.f, "#ff8a6d"]].map(([l, v, tgt, c2]) => {
        const over = v > tgt;
        return (
          <div key={l} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 10, alignItems: "center", padding: "3px 0" }}>
            <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DMB_INK50 }}>{l}</span>
            <div style={{ position: "relative", height: 5, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 2 }}>
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
function DmbDayEditor({ day, onChange, plan, variant, setVariant, customFoods }) {
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
  const tabBtn = (on) => ({ ...dmbBtn(false), padding: "6px 11px", color: on ? DMB_GOLD : "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", borderColor: on ? "rgba(var(--sh-gold-rgb, 216,162,58),0.45)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)" });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <span style={dmbLabel}>Day name</span>
          <input aria-label="Meal day name" value={day.name} onChange={(e) => onChange({ ...day, name: e.target.value })} style={{ ...dmbField, width: "100%", fontSize: 14 }} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {activeVariants.map((v) => (
            <span key={v.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setVariant(v.key)} style={tabBtn(cur === v.key)}>{v.label}</button>
              {v.key !== "training" && cur === v.key && (
                <button onClick={() => { const nv = { ...(day.variants || {}) }; delete nv[v.key]; onChange({ ...day, variants: nv }); setVariant("training"); }} aria-label={"Delete " + v.label + " variant"} title="Delete this variant" style={{ ...dmbBtn(false), padding: "6px 8px", color: DMB_RED, borderColor: "rgba(var(--sh-rust-rgb, 224,100,75),0.4)" }}>×</button>
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
            <DmbMealRow key={m.id} meal={m} constraints={plan.constraints} customFoods={customFoods}
              followers={DashMeals.hasVariantFollowers(day, m.id)}
              onChange={(next) => editBase(m.id, next)}
              onRemove={() => onChange({ ...day, slots: day.slots.filter((x) => x.id !== m.id) })} />
          ))}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPicker(!picker)} style={dmbBtn(false)}>+ Meal</button>
            {picker && (
              <DmbFoodPicker constraints={plan.constraints} customFoods={customFoods}
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
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px dashed rgba(var(--sh-ink-rgb, 242,237,228),0.14)", borderRadius: 4, padding: "9px 11px", marginBottom: 7, color: DMB_INK50 }}>
                  <span style={{ fontSize: 12.5, textDecoration: "line-through" }}>{m.slot} · {m.name}</span>
                  <span style={{ fontFamily: DMB_MONO, fontSize: 8, letterSpacing: "0.08em" }}>REMOVED ON THIS DAY</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { const o = { ...vdata.overrides }; delete o[m.id]; setVariantData(cur, { ...vdata, overrides: o }); }} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8 }}>Restore</button>
                </div>
              );
            }
            if (hasOv) {
              return (
                <DmbMealRow key={m.id} meal={ov} constraints={plan.constraints} customFoods={customFoods} badge={{ label: "Overridden", c: DMB_GOLD }}
                  onChange={(next) => setVariantData(cur, { ...vdata, overrides: { ...vdata.overrides, [m.id]: { ...next, id: m.id } } })}
                  onRemove={() => setVariantData(cur, { ...vdata, overrides: { ...vdata.overrides, [m.id]: null } })} />
              );
            }
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderLeft: "3px solid rgba(var(--sh-ink-rgb, 242,237,228),0.16)", borderRadius: 4, padding: "9px 11px", marginBottom: 7 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DMB_GOLD }}>{m.slot}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 10 }}>{m.name}</span>
                  <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50, marginLeft: 10 }}>{m.kcal} kcal · follows base</span>
                </div>
                <button onClick={() => setVariantData(cur, { ...vdata, overrides: { ...(vdata.overrides || {}), [m.id]: { ...JSON.parse(JSON.stringify(m)) } } })} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8 }}>Override</button>
                <button onClick={() => setVariantData(cur, { ...vdata, overrides: { ...(vdata.overrides || {}), [m.id]: null } })} style={{ ...dmbBtn(false), padding: "4px 9px", fontSize: 8, color: DMB_RED, borderColor: "rgba(var(--sh-rust-rgb, 224,100,75),0.4)" }}>Remove</button>
              </div>
            );
          })}
          {(vdata.extras || []).map((m, i) => (
            <DmbMealRow key={m.id} meal={m} constraints={plan.constraints} customFoods={customFoods} badge={{ label: "This day only", c: "var(--sh-accent, #2ee0c4)" }}
              onChange={(next) => setVariantData(cur, { ...vdata, extras: vdata.extras.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => setVariantData(cur, { ...vdata, extras: vdata.extras.filter((_, j) => j !== i) })} />
          ))}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPicker(!picker)} style={dmbBtn(false)}>+ Meal on this day</button>
            {picker && (
              <DmbFoodPicker constraints={plan.constraints} customFoods={customFoods}
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
          <div key={key(g)} style={{ display: "grid", gridTemplateColumns: "1fr 86px auto", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
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
            <button onClick={() => onEdits({ ...(edits || {}), [key(g)]: { remove: true } })} aria-label={"Remove " + g.name} style={{ ...dmbBtn(false), padding: "3px 7px", color: DMB_RED, borderColor: "rgba(var(--sh-rust-rgb, 224,100,75),0.4)" }}>×</button>
          </div>
        ))}
        {removedKeys.map((k) => {
          const src = auto.grocery.find((g) => key(g) === k);
          if (!src) return null;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)", color: DMB_INK50 }}>
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
    if (lifecycle.intake.some((c) => c.profile.id === id)) return { label: "Intake pending", c: "var(--sh-accent, #2ee0c4)" };
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
      <button type="button" aria-label="Close assignment" onClick={onClose} style={{ position: "absolute", inset: 0, width: "100%", border: 0, background: "rgba(10,10,8,0.65)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(480px, 94vw)", maxHeight: "86vh", overflowY: "auto", background: "var(--sh-ground2, #14110e)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", borderRadius: 10, padding: 22, color: "var(--sh-ink, #f2ede4)", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)" }}>
        <div style={{ fontFamily: DMB_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DMB_GOLD }}>Assign · {template.name}</div>
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 23, margin: "6px 0 4px" }}>Put clients on it.</div>
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
                <button key={l} onClick={() => setTrainingDows({ ...trainingDows, [i]: !trainingDows[i] })} style={{ ...dmbBtn(false), padding: "5px 7px", fontSize: 8, color: trainingDows[i] ? DMB_GOLD : "var(--sh-ink2, #a09b94)", borderColor: trainingDows[i] ? "rgba(var(--sh-gold-rgb, 216,162,58),0.45)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <span style={dmbLabel}>Clients · portion scale never edits the template</span>
        <div style={{ maxHeight: 230, overflowY: "auto", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 6, padding: "2px 10px", marginBottom: 14 }}>
          {clients.map((c) => {
            const id = c.profile.id;
            const qs = queueState(id);
            const lb = lcBadge(id);
            return (
              <label key={id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!picked[id]} onChange={(e) => setPicked({ ...picked, [id]: e.target.checked })} />
                <span style={{ fontSize: 13 }}>{c.profile.name}</span>
                {lb ? <DashPill c={lb.c}>{lb.label}</DashPill> : qs ? <DashPill c={qs === "ready" ? "var(--sh-accent, #2ee0c4)" : DMB_GOLD}>{qs === "ready" ? "Ready" : "Awaiting check-in"}</DashPill> : <span />}
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
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "var(--sh-accent, #2ee0c4)", paddingLeft: 24 }}>
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
function DmbBuilder({ template, clients, queue, lifecycle, live, onBack, onSaved, assignClientId, customFoods, ownerId }) {
  const prefs = useRememberedChoices(!!live);
  const [layout, setLayout] = useRememberedChoice(prefs, "mealBuilderLayout", COACH_BUILDER_LAYOUTS, "guided");
  const [step, setStep] = React.useState(0);
  const steps = ["Targets", "Meals", "Rotation", "Review"];
  const guided = layout === "guided";
  const [templateSaved, setTemplateSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const [name, setName] = React.useState(template.name);
  const [doc, setDoc] = React.useState(() => JSON.parse(JSON.stringify(template.detail.mealBuilder)));
  React.useEffect(() => setTemplateSaved(false), [name, doc]);
  // ⚠ THE OPEN PLAN COUNTS TOO — `customFoods` comes from SAVED plans, so a dish
  // named a minute ago would not be offered for the next day until this one had
  // been saved and re-fetched, which reads as the feature not working.
  // ⚠ THE OPEN DOCUMENT GOES FIRST. What the coach typed a moment ago is the current truth
  // about that dish; the saved copy is last week's, and first-wins on the saved side handed
  // the next meal stale macros. `mergeFoodInto` then fills whatever the open copy is
  // missing — including taking MEASURED macros over a placeholder, so reordering cannot
  // trade a stale figure for a fabricated zero. One rule, shared with the library walk.
  const ownFoods = React.useMemo(() => DashMeals.ownFoodsFor(doc, customFoods), [customFoods, doc]);
  const [sel, setSel] = React.useState(0);
  const [previewVariant, setPreviewVariant] = React.useState("training");
  const [preview, setPreview] = React.useState(false);
  const [saveState, setSaveState] = React.useState("saved");
  const [assigning, setAssigning] = React.useState(!!assignClientId);
  const persisted = React.useRef(!!template.id && !String(template.id).startsWith("demo-"));
  const idRef = React.useRef(persisted.current ? template.id : crypto.randomUUID());
  const ownerRef = React.useRef(ownerId);
  const latest = React.useRef({name,doc}); latest.current = {name,doc};
  const saved = React.useRef(JSON.stringify({name,doc}));
  const flight = React.useRef(null), active = React.useRef(true);
  React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  // Save, autosave, leave and assign share one lane. Reusing a template must POST
  // its fresh id only once, even when Save is pressed during the debounce.
  const flush = async () => {
    if(flight.current){if(!await flight.current)return false;if(saved.current!==JSON.stringify(latest.current))return flush();return true;}
    const value=latest.current, serial=JSON.stringify(value);
    if(persisted.current && saved.current===serial)return true;
    if(!value.name.trim()){setSaveError("Give this meal plan a name.");return false;}
    setSaveError("");setSaveState("saving");
    flight.current=(async()=>{
      try{
        if(live){
          const res=await fetch("/api/coach/plans",{method:persisted.current?"PATCH":"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:idRef.current,kind:"meal_plan",name:value.name,expectedOwnerId:ownerRef.current,meta:value.doc.targets.kcal+" kcal · "+dmbPhase(value.doc.goalPhase).label,detail:{...(template.detail||{}),mealBuilder:value.doc}})});
          const data=await res.json();
          if(!res.ok || !data.plan?.id)throw Error(data.error || "Save failed. Keep this page open and retry to save your edits.");
          idRef.current=data.plan.id;persisted.current=true;
        } else if(!dmbWriteDraft(idRef.current,value.name,value.doc))throw Error("This browser could not retain your draft. Keep this page open.");
        saved.current=serial;
        if(active.current){setSaveState("saved");onSaved?.({id:idRef.current,name:value.name,doc:value.doc});}
        return true;
      }catch(e){if(active.current){setSaveState("error");setSaveError(e.message || "Save failed. Retry.");}return false;}
      finally{flight.current=null;}
    })();
    const ok = await flight.current;
    // Edits made during a request must finish saving before leaving or assigning.
    return ok && saved.current !== JSON.stringify(latest.current) ? flush() : ok;
  };
  React.useEffect(()=>{
    if(saved.current===JSON.stringify({name,doc}))return;
    if(!live)dmbWriteDraft(idRef.current,name,doc);
    setSaveState("dirty");
    const timer=setTimeout(()=>flush(),1200);
    return()=>clearTimeout(timer);
  },[name,doc]);
  React.useEffect(()=>{
    const guard=e=>{if(saved.current!==JSON.stringify(latest.current)){e.preventDefault();e.returnValue="";}};
    window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);
  },[]);
  const leave=async()=>{if(await flush())onBack();};

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
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved edits…" : saveState === "error" ? "Save failed — retrying on next edit" : live ? (persisted.current ? "Saved" : "New template · not saved yet") : "Draft saved locally";
  // One list with the library's Diet filter (DashMeals.ALLERGENS), so a plan built to
  // exclude an allergen and a filter asking for plans without it name the same ones.
  const EXCLUSION_TAGS = DashMeals.ALLERGENS;

  return (
    <div className="cbuilder" data-layout={layout} data-step={step}>
      <CoachBuilderNav layout={layout} onLayout={setLayout} step={step} onStep={setStep} steps={steps}/>
      {template.sourceName && (!guided || step === 0) && <p className="cb-copy">Based on <strong>{template.sourceName}</strong>. You’re editing a new copy; the original template stays unchanged.</p>}
      {guided && <div className="cb-intro"><h2>{["Set the plan’s targets", "Build a day of meals", "Plan the rotation", "Review before sharing"][step]}</h2><p>{["Give this template a name, set targets and dietary exclusions. Your food search uses these choices.", "Add your own meals or choose from the library. Set macros and approved swaps, with optional rest and travel variants.", "Add or copy days to create a rotation. Phase tools adjust every day, variant and swap together.", "Check the client’s meals and grocery list. Save a reusable template or choose clients and a start date."][step]}</p></div>}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={leave} style={dmbBtn(false)}>← Library</button>
        <input aria-label="Meal plan name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...dmbField, fontSize: 22, fontWeight: 600, minWidth: 0, flex: "1 1 220px", maxWidth: "100%" }} />
        <select value={doc.goalPhase} onChange={(e) => {
          const p = dmbPhase(e.target.value);
          setDoc({ ...doc, goalPhase: p.key, targets: { ...p.targets }, constraints: { ...doc.constraints, proteinFloor: p.targets.p - 20 } });
        }} style={{ ...dmbField, fontFamily: DMB_MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: phase.c, padding: "6px 8px" }}>
          {DashMeals.GOAL_PHASES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>v{doc.version} · {saveLabel}</span>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DMB_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: preview ? "var(--sh-accent, #2ee0c4)" : DMB_INK50, cursor: "pointer" }}>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Client preview
        </label>
        <button hidden={guided && step !== 3} onClick={() => setDoc({ ...doc, version: (doc.version || 1) + 1 })} title="Bump the template version — assignments stamp the version they were sent from" style={dmbBtn(false)}>Publish v{(doc.version || 1) + 1}</button>
        <button disabled={saveState === "saving"} onClick={async()=>{if(await flush())setTemplateSaved(true);}} style={dmbBtn(false)}>Save template</button>
        <button hidden={guided && step !== 3} onClick={async()=>{if(await flush())setAssigning(true);}} style={dmbBtn(true)}>Assign to clients →</button>
      </div>

      {saveError && <p role="alert">{saveError} <button style={dmbBtn(false)} onClick={flush}>Retry save</button></p>}
      {templateSaved && <p role="status">{live ? "Template saved to your library. Use as template makes a separate copy next time." : "Template draft saved on this device. Sign in to save to your library."}</p>}
      <div className="dmb-layout">
        {/* Left — targets first, then constraints, days, week tools */}
        <div className="dmb-side" hidden={guided && step === 3}>
          <div hidden={guided && step !== 0} className="dash-plate dash-plate--tick" style={{ "--dac": phase.c, paddingLeft: 22 }}>
            <div className="dash-eyebrow" style={{ color: phase.c }}>Targets · set these first</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              {[["kcal", "kcal"], ["p", "Protein g"], ["c", "Carbs g"], ["f", "Fat g"]].map(([k, l]) => (
                <div key={k}><span style={dmbLabel}>{l}</span><input aria-label={"Daily " + l + " target"} type="number" value={doc.targets[k]} onChange={(e) => setTargets(k, e.target.value)} style={{ ...dmbField, width: "100%" }} /></div>
              ))}
            </div>
          </div>

          <div hidden={guided && step !== 0} className="dash-plate" style={{ "--dac": DMB_GOLD, padding: "14px 16px" }}>
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
                      style={{ ...dmbBtn(false), padding: "4px 8px", fontSize: 8, color: on ? DMB_RED : "var(--sh-ink2, #a09b94)", borderColor: on ? "rgba(var(--sh-rust-rgb, 224,100,75),0.45)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)" }}>
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

          <div hidden={guided && step === 0} className="dash-plate dmb-rotation" style={{ "--dac": DMB_GOLD, padding: "14px 16px" }}>
            <div className="dash-eyebrow" style={{ color: DMB_GOLD }}>Days · rotation</div>
            <div className={layout === "editor" ? undefined : "dmb-rotation-list"} style={{ marginTop: 8 }}>
              {doc.days.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <button onClick={() => setSel(i)} style={{ flex: 1, textAlign: "left", cursor: "pointer", border: "1px solid " + (sel === i ? DMB_GOLD : "rgba(var(--sh-ink-rgb, 242,237,228),0.1)"), borderLeft: "3px solid " + (sel === i ? DMB_GOLD : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)"), background: sel === i ? "rgba(var(--sh-gold-rgb, 216,162,58),0.1)" : "transparent", color: "var(--sh-ink, #f2ede4)", borderRadius: 4, padding: "7px 9px", fontSize: 12.5 }}>
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

          <div hidden={guided && step !== 2} className="dash-plate" style={{ "--dac": phase.c, padding: "14px 16px" }}>
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
        <div hidden={guided && step !== 1 && step !== 2} className="dash-plate dash-plate--tick dmb-content" style={{ "--dac": DMB_GOLD, paddingLeft: 24 }}>
          <span className="dash-eyebrow" style={{ color: DMB_GOLD }}>{day ? day.name : "Day"} · {curVariant === "training" ? "training day" : curVariant + " day"} · running total</span>
          <div className="dash-ledger" style={{ "--dac": DMB_GOLD, margin: "9px 0 10px" }} />
          <DmbTotalsBar meals={resolved} targets={doc.targets} warnings={warnings} />
          {day
            ? <DmbDayEditor day={day} onChange={setDay} plan={doc} variant={curVariant} setVariant={setPreviewVariant} customFoods={ownFoods} />
            : <div style={{ color: DMB_INK50, fontSize: 13 }}>Pick a day on the left.</div>}
        </div>

        {/* Right — client preview (the literal card) + grocery */}
        {(preview || (guided && step === 3)) && (
          <div className="dmb-preview">
            <label>Preview day<select aria-label="Meal preview day" style={dmbField} value={sel} onChange={e=>setSel(Number(e.target.value))}>{doc.days.map((d,i)=><option value={i} key={i}>{d.name}</option>)}</select></label>
            {day && <DmbClientPreview doc={doc} day={day} variant={curVariant} />}
            <div className="dash-plate" style={{ "--dac": DMB_GOLD, padding: "16px 18px" }}>
              <DmbGroceryPanel plan={doc} edits={doc.groceryEdits || {}} onEdits={(e) => setDoc({ ...doc, groceryEdits: e })} />
            </div>
          </div>
        )}
      </div>

      {guided && <CoachBuilderFooter step={step} onStep={setStep} steps={steps}/>}
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
    { key: "intake", label: "Intake pending", c: "var(--sh-accent, #2ee0c4)", sub: "No first check-in yet — chase the intake before assigning", action: null },
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
                <span style={{ fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 13, fontWeight: 600, minHeight: 36, color: g.c }}>{g.label}</span>
                <span style={{ fontFamily: DMB_MONO, fontSize: 9, color: DMB_INK50 }}>{list.length}</span>
              </div>
              <div style={{ fontSize: 11, color: DMB_INK50, lineHeight: 1.45, margin: "4px 0 8px" }}>{g.sub}</div>
              {list.map((c) => (
                <div key={c.profile.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
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
// The facts line on a library card, in the filters' own words so a nutritionist can see
// why a card matched — and what the page could NOT check, said as such.
function dmbCardFacts(info) {
  const parts = [];
  const d = info.diet, p = info.prep;
  // "None of the N allergens Shape checks", never a bare "allergen-free": sesame, for one, is
  // not on the list, and the count is read from the list so it cannot drift from it.
  if (d.known) parts.push(d.contains.length ? "Contains " + d.contains.join(", ") : "None of the " + DashMeals.ALLERGENS.length + " allergens Shape checks");
  else parts.push(d.contains.length ? "Contains " + d.contains.join(", ") + " · the rest not checked" : "Allergens not checked");
  if (p.known && p.max != null) parts.push("Longest meal " + p.max + " min");
  else if (p.max != null && p.max > 30) parts.push("Longest meal at least " + p.max + " min");
  else parts.push("Prep time not recorded on every meal");
  if (info.dayTypes.length) parts.push(info.dayTypes.map((k) => (k === "rest" ? "Rest-day" : "Travel-day")).join(" & ") + " version");
  return parts.join(" · ");
}

function NutritionistPlansPage() {
  const { clients, queue, today: live, source } = useDashboard("nutritionist");
  const [templates, setTemplates] = React.useState(null);
  const [view, setView] = React.useState(null); // null = library, else { template, assignClientId? }
  const [filters, setFilters] = React.useState(DFB_EMPTY);
  const [assignFor, setAssignFor] = React.useState(null); // { template, clientId? }
  const [error, setError] = React.useState("");
  const [appOnly, setAppOnly] = React.useState(0);
  const [refresh, setRefresh] = React.useState(0);
  const libraryOwner = React.useRef(null);
  // Whether the library has answered once. "+ New meal plan" works while it is still
  // loading, and the first answer is not an account CHANGE — treating it as one closed the
  // builder under the coach's hands and took what they had typed with it.
  const resolved = React.useRef(false);
  const isLive = !!live;
  const lifecycle = React.useMemo(() => DashMeals.buildPlanLifecycle(clients || [], queue || []), [clients, queue]);

  // ⚠ SHAPE'S EXAMPLE PLANS ARE THE PREVIEW'S, NEVER A SIGNED-IN LIBRARY'S. This page used
  // to fall back to them whenever the read came back empty or failed — so a nutritionist
  // with no website plans yet, or one who builds only in the app, was shown three plans
  // they never wrote as their own, and opening one saved it into their account as theirs.
  // Now: the preview gets the examples; an empty library is empty; a failed read says so
  // and offers Retry. Mirrors the workout library (dashBuilder.jsx).
  React.useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/plans?kind=meal_plan", { credentials: "same-origin" });
        const d = await res.json().catch(() => null);
        if (!res.ok || !d) throw new Error((d && d.error) || "Could not load your meal plans. Check your connection and retry.");
        const all = Array.isArray(d.plans) ? d.plans : [];
        const rows = all.filter((p) => p && p.detail && p.detail.mealBuilder);
        if (!on) return;
        // A different account is a different library: nothing from the last one — the
        // open plan, the assign sheet, the filters — may carry across.
        const owner = d.ownerId || null;
        if (resolved.current && libraryOwner.current !== owner) { setView(null); setAssignFor(null); setFilters(DFB_EMPTY); }
        resolved.current = true;
        libraryOwner.current = owner;
        setTemplates(rows);
        // Plans written in the app have no website builder document, so this page cannot
        // open them — it says how many rather than pretending they do not exist.
        setAppOnly(all.length - rows.length);
        setError("");
      } catch (e) {
        if (!on) return;
        // Until the dashboard knows whether anyone is signed in, a failure means nothing
        // yet: stay on Loading rather than flash an error at a visitor about to see the preview.
        if (source == null) return;
        if (source === "demo" && !libraryOwner.current) { resolved.current = true; setTemplates(DashMeals.demoMealTemplates()); setAppOnly(0); setError(""); }
        else { setError(e.message || "Could not load your meal plans. Check your connection and retry."); setTemplates(null); }
      }
    })();
    return () => { on = false; };
  }, [source, refresh]);
  // A plan saved on the phone shows up here without a reload.
  React.useEffect(() => {
    const update = () => { if (!document.hidden) setRefresh((n) => n + 1); };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);

  // Every filter reads the plan's own facts (DashMeals.mealPlanFacts).
  const phaseFacet = React.useMemo(() => DashMeals.mealPhaseFacet(), []);
  const items = React.useMemo(() => (templates || []).map((t) => ({ t, ...DashMeals.mealPlanFacts(t) })), [templates]);
  const run = dfbRun(items, [...DashMeals.MEAL_FACETS, phaseFacet], filters);
  // Every dish this nutritionist has written that Shape does not list.
  const customFoods = DashMeals.customFoodsFromTemplates(templates || []);
  const newPlan = (phaseKey) => ({ id: null, name: "New meal plan", detail: { mealBuilder: DashMeals.newPlan("New meal plan", phaseKey || "maintain") } });
  // "Write plan" from the lifecycle: pre-fill the assign modal with that client on the
  // matching-phase template (else the first one). With no template yet it opens a new plan
  // in the client's phase — a button that does nothing on an empty library is a dead one.
  const writePlanFor = (clientId) => {
    const c = (clients || []).find((x) => x.profile.id === clientId);
    const tpl = (templates || []).find((t) => c && c.goalPhase && t.detail.mealBuilder.goalPhase === c.goalPhase) || (templates || [])[0];
    if (tpl) setAssignFor({ template: tpl, clientId });
    else setView({ template: newPlan(c && c.goalPhase) });
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
            key={view.template.id || view.template.name}
            template={view.template} ownerId={libraryOwner.current}
            clients={clients} queue={queue} lifecycle={lifecycle} live={isLive}
            assignClientId={view.assignClientId}
            customFoods={customFoods}
            onBack={() => { setView(null); setRefresh((n) => n + 1); }}
            onSaved={({ id, name, doc }) => {
              setTemplates(prev => [{id,name,detail:{...view.template.detail,mealBuilder:doc}},...(prev||[]).filter(t=>t.id!==id)]);
            }}
          />
        ) : (
          <React.Fragment>
            {/* Zone 1 — Library */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => setView({ template: newPlan("maintain") })} style={dmbBtn(true)}>+ New meal plan</button>
              <button onClick={() => setRefresh((n) => n + 1)} style={dmbBtn(false)}>Refresh</button>
            </div>
            {error && <p role="alert" style={{ fontSize: 13.5, color: "var(--sh-ink, #f2ede4)" }}>{error} <button onClick={() => setRefresh((n) => n + 1)} style={dmbBtn(false)}>Retry</button></p>}
            {templates == null && !error && <p role="status" style={{ color: DMB_INK50, fontSize: 13 }}>Loading plans…</p>}
            {templates && templates.length === 0 && <p style={{ fontSize: 13.5, color: DMB_INK50 }}>No meal plans on the website yet. Build one to start your library.</p>}
            {appOnly > 0 && <p style={{ fontFamily: DMB_MONO, fontSize: 9, lineHeight: 1.6, letterSpacing: "0.06em", color: DMB_INK50, margin: "0 0 14px" }}>
              {appOnly === 1 ? "1 meal plan you wrote in the app isn’t listed here" : appOnly + " meal plans you wrote in the app aren’t listed here"} — the website builder can’t open {appOnly === 1 ? "it" : "them"} yet. You’ll find {appOnly === 1 ? "it" : "them"} in the app.
            </p>}
            {!!(templates && templates.length) && <>
              {/* ⚠ EVERY FILTER SAYS WHAT IT WOULD LEAVE. Options inside one filter widen it,
                  two filters narrow each other, and the count beside Clear is the result. */}
              <DashFilterBar facets={DashMeals.MEAL_FACETS} run={run} state={filters} setState={setFilters} one="plan" many="plans" placeholder="Find a plan…" />
              <DashTagChips facet={phaseFacet} run={run} onToggle={(k) => setFilters((s) => dfbToggle(s, "phase", k))} onClear={() => setFilters((s) => dfbClearFacet(s, "phase"))} />
            </>}
            {!!(templates && templates.length) && !run.shown.length && <p role="status" style={{ fontSize: 13.5, color: DMB_INK50 }}>No plans match these filters. <button onClick={() => setFilters(DFB_EMPTY)} style={dmbBtn(false)}>Clear filters</button></p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14, marginBottom: 22 }}>
              {run.shown.map(({ t, info }) => {
                const b = t.detail.mealBuilder;
                const ph = dmbPhase(b.goalPhase);
                const variants = b.days.reduce((s, d) => s + Object.keys(d.variants || {}).length, 0);
                return (
                  <div key={t.id || t.name} className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": ph.c, paddingLeft: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span className="dash-eyebrow" style={{ color: ph.c }}>{ph.label}</span>
                      <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>v{b.version}</span>
                    </div>
                    <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 21, letterSpacing: "-0.015em", margin: "7px 0 3px" }}>{t.name}</div>
                    <div style={{ fontFamily: DMB_MONO, fontSize: 9, color: DMB_INK50 }}>{b.targets.kcal} kcal · {b.targets.p}P · {b.days.length}-day rotation{variants ? " · " + variants + " variant" + (variants === 1 ? "" : "s") : ""}</div>
                    <div style={{ fontFamily: DMB_MONO, fontSize: 8.5, lineHeight: 1.6, color: DMB_INK50, marginTop: 6 }}>{dmbCardFacts(info)}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button onClick={() => setAssignFor({ template: t })} style={dmbBtn(true)}>Assign to client</button>
                      <button onClick={() => setView({ template: coachTemplateCopy(t) })} style={dmbBtn(true)}>Use as template</button>
                      <button onClick={() => setView({ template: t })} style={dmbBtn(false)}>Edit template</button>
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
