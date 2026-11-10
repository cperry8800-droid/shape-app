// Nutritionist Plans v2 — the library (its to-do line, filters and cards; the owner's coach
// review, step 6a) and the meal-plan builder (the week on one screen, step 6c). Logic lives in
// dashMealCore.js and dashMealWeek.js (pure, tested); this file is UI. Templates persist to /api/coach/plans (detail.mealBuilder);
// assignment snapshots into client_meal_plans via /api/nutritionist/meal-plan
// — the same store the client today-rail, mobile Eat tab, and auto-grocery
// already read. Signed out / API down: the demo templates render under the
// demo band and drafts go to localStorage, so the builder is fully usable in
// preview.
//
// Load order: pageShell → trainerDashboard → coachNav → clientNav →
// dashSignals → dashData → dashToday → dashClient (DashMealLedgerCard) →
// dashMealCore → dashMealWeek (the builder's week, step 6c) → dashFilterBar (the library's filters
// and shared pieces) → recipes.jsx (Shape Kitchen's catalog, SHAPE_RECIPES) → this file. The tier
// gems (DashClientGem) are dashToday's, read at render.

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
          // throws away every move ticked so far. Both are handed back to the IME. keyCode 229
          // is Safari's form: WebKit ends the composition before the keydown for the Enter
          // that confirms it, so `isComposing` already reads false there.
          if (e.nativeEvent && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) return;
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
// The slot a meal added without a row takes (the day editor's "+ Meal", a rest day's extra):
// dashMealCore.js's nextSlot (the first main meal the day lacks, then a Snack). In the week the row
// IS the meal (DashMealWeek.placeMeal). ⚠ dashMealCore.js IS A PLAIN <script> WITH A HAND-TYPED
// `?v=`, NOT CONTENT-HASHED AT DEPLOY, so a browser can pair a cached copy without nextSlot with
// this file. The cached case used to keep the old rule, "Breakfast only when the day is empty, Lunch
// after that" (the owner's coach review, step 6c: "Breakfast, Lunch, Lunch, Lunch"); it now reads
// the same rule from the week module, and only a page missing both falls back to it.
function dmbNextSlot(slots) {
  if (typeof DashMeals.nextSlot === "function") return DashMeals.nextSlot(slots);
  if (typeof DashMealWeek !== "undefined" && typeof DashMealWeek.nextSlot === "function") return DashMealWeek.nextSlot(slots);
  return slots.length === 0 ? "Breakfast" : "Lunch";
}

// ── A playlist on a day or a meal ───────────────────────────────────────────
// The nutritionist links one of their saved playlists (GET /api/coach/soundtracks) to a plan day
// ("Sunday prep") or to one meal, as `{ id?, name, meta }` on `day.playlist` or `meal.playlist`; the
// assignment sends it with that day or meal (DashMeals.buildMealAssignment), so the member's app can
// label it "For Sun · Sunday prep". Cleared, the key goes, so an untouched plan stores what it did.
// The list is the trainer builder's (dashBuilder.jsx's dbuPlaylistChoice), less a playlist sent as a
// trainer's (`role: 'trainer'`), which the member's Train page plays, not Eat.
function dmbPlaylistChoices(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((x) => x && x.role !== "trainer" && typeof x.name === "string" && x.name.trim())
    .map((x) => {
      const n = Number(x.tracks);
      return { ...(x.id != null && x.id !== "" ? { id: x.id } : {}), name: x.name.trim(), meta: Number.isFinite(n) && n > 0 ? n + (n === 1 ? " track" : " tracks") : "" };
    });
}
const dmbHasPlaylist = (p) => !!(p && typeof p.name === "string" && p.name.trim());
// The day or meal with this playlist, or with none: no `null` is stored, the key goes.
function dmbWithPlaylist(obj, p) {
  const next = { ...obj };
  if (p) next.playlist = { ...(p.id != null && p.id !== "" ? { id: p.id } : {}), name: p.name, meta: p.meta || "" };
  else delete next.playlist;
  return next;
}
// ⚠ A PLAYLIST THE DAY OR MEAL ALREADY CARRIES IS OFFERED EVEN WHEN THE LIST LACKS IT (signed out,
// a read that failed, or one since deleted), or the select would show "No playlist" over a day that
// has one, as DbuDayChips keeps it. Matched by id, and by name for one saved without an id.
function DmbPlaylistSelect({ value, playlists, onChange, label, style }) {
  const keyOf = (p) => (p && p.id != null && p.id !== "" ? "id:" + p.id : "name:" + ((p && p.name) || ""));
  const same = (p, q) => !!p && !!q && (q.id != null && q.id !== "" ? p.id === q.id : p.name === q.name);
  const list = Array.isArray(playlists) ? playlists : [];
  const has = dmbHasPlaylist(value);
  const lists = has && !list.some((p) => same(p, value)) ? [value, ...list] : list;
  const current = has ? lists.find((p) => same(p, value)) : null;
  return (
    <select aria-label={label} value={current ? keyOf(current) : ""} style={style}
      onChange={(e) => onChange(lists.find((x) => keyOf(x) === e.target.value) || null)}>
      <option value="">No playlist</option>
      {lists.map((p) => <option key={keyOf(p)} value={keyOf(p)}>{p.name}{p.meta ? " · " + p.meta : ""}</option>)}
      {!lists.length && <option value="" disabled>No playlists yet</option>}
    </select>
  );
}

function DmbMealRow({ meal, onChange, onRemove, constraints, followers, badge, customFoods, playlists }) {
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
      {/* A note to the client on this meal (step 6c): the assignment carries it as `coachNote`, which
          the client's Kitchen card prints labelled COACH. A cleared note leaves no key behind. */}
      <input aria-label={(meal.name || "This meal") + " note to the client"} value={typeof meal.note === "string" ? meal.note : ""} maxLength={240}
        onChange={(e) => { const next = { ...meal }; if (e.target.value) next.note = e.target.value; else delete next.note; onChange(next); }}
        placeholder="Note to the client · optional" style={{ ...dmbField, width: "100%", marginTop: 8 }} />
      {/* Night-before prep (Phase 2): the client is reminded the evening before and Eat shows it on
          tonight's card. A Shape dish that always needs it (the overnight oats) is marked, not ticked;
          any other meal can be. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {DashMeals.shapeMadeAhead(meal.name) ? (
          <span data-night-before="shape" style={{ fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sh-accent-ink, #2ee0c4)" }}>✓ Prepped the night before · Shape recipe</span>
        ) : (
          <label data-night-before="tick" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, cursor: "pointer", fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: meal.prepNightBefore === true ? "var(--sh-accent-ink, #2ee0c4)" : DMB_INK50 }}>
            <input type="checkbox" checked={meal.prepNightBefore === true} onChange={(e) => onChange(DashMeals.setNightBefore(meal, e.target.checked))} aria-label={"Prep " + (meal.name || "this meal") + " the night before"} style={{ accentColor: "var(--sh-accent, #2ee0c4)", width: 16, height: 16, margin: 0 }} />
            Prep the night before
          </label>
        )}
        {/* A playlist for this meal, sent with it (`playlist` on the assignment's meal). */}
        <label data-meal-playlist="" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, fontFamily: DMB_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: dmbHasPlaylist(meal.playlist) ? "var(--sh-accent-ink, #2ee0c4)" : DMB_INK50 }}>
          <span aria-hidden="true">♪ Playlist</span>
          <DmbPlaylistSelect value={meal.playlist} playlists={playlists} label={(meal.name || "This meal") + " playlist"}
            onChange={(p) => onChange(dmbWithPlaylist(meal, p))}
            style={{ ...dmbField, fontFamily: DMB_MONO, fontSize: 9, letterSpacing: "0.04em", textTransform: "none", padding: "5px 7px", maxWidth: 220 }} />
        </label>
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
// `only` (step 6c): the week shows every meal, so the editor under it opens ONE — the meal picked in
// the week (its id), or none (null), when it shows only the day's name and playlist, its versions and what a rest
// or travel day has removed. Left out, it lists them all, as before.
// `playlists`: the coach's saved playlists for the day's and each meal's picker (DmbPlaylistSelect).
function DmbDayEditor({ day, onChange, plan, variant, setVariant, customFoods, only, onAdded, onDuplicate, onDelete, playlists }) {
  const shows = (m) => only === undefined || (only != null && m.id === only);
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
        {/* The day's playlist goes with every weekday this day is served on, a rest day too. */}
        <div data-day-playlist="" style={{ flex: "0 1 220px", minWidth: 150 }}>
          <span style={dmbLabel}>Playlist for this day</span>
          <DmbPlaylistSelect value={day.playlist} playlists={playlists} label={"Playlist for " + (day.name || "this day")}
            onChange={(p) => onChange(dmbWithPlaylist(day, p))} style={{ ...dmbField, width: "100%", fontSize: 12.5, color: dmbHasPlaylist(day.playlist) ? "var(--sh-accent-ink, #2ee0c4)" : dmbField.color }} />
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
          {onDuplicate && <button type="button" onClick={onDuplicate} title="Duplicate this day" style={{ ...dmbBtn(false), padding: "6px 9px", fontSize: 8 }}>⧉ Duplicate day</button>}
          {onDelete && <button type="button" onClick={onDelete} style={{ ...dmbBtn(false), padding: "6px 9px", fontSize: 8, color: DMB_RED, borderColor: "rgba(var(--sh-rust-rgb, 224,100,75),0.4)" }}>× Delete day</button>}
        </div>
      </div>

      {cur === "training" ? (
        <React.Fragment>
          {day.slots.filter(shows).map((m) => (
            <DmbMealRow key={m.id} meal={m} constraints={plan.constraints} customFoods={customFoods} playlists={playlists}
              followers={DashMeals.hasVariantFollowers(day, m.id)}
              onChange={(next) => editBase(m.id, next)}
              onRemove={() => onChange({ ...day, slots: day.slots.filter((x) => x.id !== m.id) })} />
          ))}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPicker(!picker)} style={dmbBtn(false)}>+ Meal</button>
            {picker && (
              <DmbFoodPicker constraints={plan.constraints} customFoods={customFoods}
                onPick={(f) => { const added = DashMeals.newMeal(f, dmbNextSlot(day.slots)); onChange({ ...day, slots: [...day.slots, added] }); setPicker(false); if (onAdded) onAdded(added.id); }}
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
            // With nothing picked, the editor keeps what the week cannot show: a meal removed on this day.
            if (!(shows(m) || (only === null && hasOv && ov === null))) return null;
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
                <DmbMealRow key={m.id} meal={ov} constraints={plan.constraints} customFoods={customFoods} playlists={playlists} badge={{ label: "Overridden", c: DMB_GOLD }}
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
          {(vdata.extras || []).map((m, i) => !shows(m) ? null : (
            <DmbMealRow key={m.id} meal={m} constraints={plan.constraints} customFoods={customFoods} playlists={playlists} badge={{ label: "This day only", c: "var(--sh-accent, #2ee0c4)" }}
              onChange={(next) => setVariantData(cur, { ...vdata, extras: vdata.extras.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => setVariantData(cur, { ...vdata, extras: vdata.extras.filter((_, j) => j !== i) })} />
          ))}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPicker(!picker)} style={dmbBtn(false)}>+ Meal on this day</button>
            {picker && (
              <DmbFoodPicker constraints={plan.constraints} customFoods={customFoods}
                onPick={(f) => {
                  // ⚠ NOT "Snack" FOR EVERY ONE (step 6c): an extra takes the slot the rest or travel day
                  // lacks, read over that day as the client gets it.
                  const added = DashMeals.newMeal(f, dmbNextSlot(DashMeals.resolveDay(day, cur)));
                  setVariantData(cur, { ...vdata, extras: [...(vdata.extras || []), added] }); setPicker(false); if (onAdded) onAdded(added.id);
                }}
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
              {g.qty == null ? <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>no amount</span> : <input type="number" value={g.qty} onChange={(e) => {
                const v = Number(e.target.value);
                if (!isFinite(v) || v <= 0) return;
                onEdits({ ...(edits || {}), [key(g)]: { qty: v } });
              }} style={{ ...dmbField, width: 58, padding: "4px 6px", fontSize: 11 }} />}
              {g.qty == null ? null : <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>{g.unit || "×"}</span>}
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
// `emptyNote` is what an empty client list means, from the library page (step 6a): a roster that
// could not be read says so, and only a read, empty roster reads "No clients yet."
// `onAssigned(ids)`: the clients a plan was sent to, so the library reads who is on what and who is
// still due again (Codex on #2645); it fires on a partial send too, since those plans are live.
function DmbAssignModal({ template, doc, groceryEdits, clients, queue, lifecycle, live, preselectId, onClose, emptyNote, onAssigned }) {
  // ⚠ ONE CLOSE PER SHEET (Codex on #2645). A finished assign closes itself a moment later; a coach
  // who closes it first (Cancel, the scrim, Esc) used to get a second close when the timer fired, and
  // the library's Assign all stepped past the next client. The first close wins, and the timer goes
  // with the sheet.
  const closedRef = React.useRef(false);
  const closeTimer = React.useRef(null);
  React.useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    onClose();
  };
  const [picked, setPicked] = React.useState(() => (preselectId ? { [preselectId]: true } : {}));
  React.useEffect(() => { if (preselectId) setPicked((prev) => ({ ...prev, [preselectId]: true })); }, [preselectId]);
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
    const sent = [];
    try {
      for (const id of ids) {
        const scale = Number(scales[id]) > 0 ? Number(scales[id]) : 1;
        const opts = { scale, trainingDows: dows, groceryEdits: groceryEdits && Object.keys(groceryEdits).length ? groceryEdits : null };
        // The week's additions ride the core's snapshot: a rest day's own target, each meal's note to
        // the client, and a Kitchen meal's recipe (DashMealWeek.buildAssignment).
        const out = typeof DashMealWeek !== "undefined" && typeof DashMealWeek.buildAssignment === "function" ? DashMealWeek.buildAssignment(DashMeals, doc, opts) : DashMeals.buildMealAssignment(doc, opts);
        if (live) {
          const res = await fetch("/api/nutritionist/meal-plan", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            // The library plan it came from, so the library can say who is on it (the route keeps it
            // only when the plan is this coach's own). A brand-new unsaved plan has none.
            body: JSON.stringify({ clientId: id, title: template.name + (scale !== 1 ? " · ×" + scale : ""), weekStart: startDate, days: out.days, ...(template.id ? { templateId: String(template.id) } : {}) }),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          sent.push(id);
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
      if (live && typeof onAssigned === "function") onAssigned(sent);
      closeTimer.current = setTimeout(close, 1100);
    } catch (e) {
      if (live && sent.length && typeof onAssigned === "function") onAssigned(sent);
      setState("error");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250 }}>
      <button type="button" aria-label="Close assignment" onClick={close} style={{ position: "absolute", inset: 0, width: "100%", border: 0, background: "rgba(10,10,8,0.65)", backdropFilter: "blur(3px)" }} />
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
          {!clients.length && <div role="status" style={{ fontSize: 12, color: DMB_INK50, padding: 8 }}>{emptyNote || "No clients loaded."}</div>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={assign} disabled={!ids.length || state === "working"} style={{ ...dmbBtn(true), padding: "11px 18px", opacity: !ids.length || state === "working" ? 0.6 : 1 }}>
            {state === "working" ? "Assigning…" : state === "done" ? "Assigned ✓" : "Publish to " + (ids.length || 0) + " client" + (ids.length === 1 ? "" : "s")}
          </button>
          <button onClick={close} style={dmbBtn(false)}>Cancel</button>
          {state === "error" && <span style={{ fontFamily: DMB_MONO, fontSize: 9, color: DMB_RED }}>Couldn't assign — try again</span>}
          {!live && <span style={{ fontFamily: DMB_MONO, fontSize: 8.5, color: DMB_INK50 }}>DEMO · marks the queue only</span>}
        </div>
      </div>
    </div>
  );
}

// ── Client preview — the EXACT meals + ledger card the client dashboard
// renders, playable: log meals, watch the ledger tick, swap alternates. ─────
// `targets` and `label` are the picked day's own (Codex on #2648): a rest day is measured against the
// plan's rest-day target and called a rest day, whether or not it has a rest version of its meals.
// What the Kitchen's exclusions are, said the same way on the panel and in the plan's rules: words
// read from a recipe's name and its ingredient names, never a certified allergen check. A Kitchen
// recipe's dairy and gluten are the catalog's own lists instead (Codex on the PR after #2648).
const DMB_ALLERGEN_NOTE = "read from recipe names and ingredients, not a certified allergen check";
const DMB_LISTED_NOTE = "from Shape Kitchen’s own lists";

function DmbClientPreview({ doc, day, variant, targets, label }) {
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
          meals={meals} targets={targets || doc.targets} ledger={ledger} logged={logged}
          onLog={(m) => {
            if (logged[m.id]) return;
            setLogged({ ...logged, [m.id]: true });
            setLedger((l) => ({ kcal: l.kcal + (m.kcal || 0), p: l.p + (m.p || 0), c: l.c + (m.c || 0), f: l.f + (m.f || 0) }));
          }}
          headerNote={label || (variant === "training" ? "training day" : variant + " day")}
        />
      </div>
    </div>
  );
}

// ── The builder (the owner's coach review, step 6c: "the week on one screen") ──────────────────
// "One day at a time, with Shape Kitchen out of reach." It is a tool page with a fixed layout, one
// screen tall: the brief (one sentence, one action), then the week — the plan's days across and the
// four meals down, so the row a dish lands on IS its meal — with the picked day's ring and the one
// meal open beneath it, and beside the week the client's assign line, Shape Kitchen, and the grocery
// list's first items. No Guided / Editor / Planner switch, Publish vN or Save template: the plan
// saves as it changes and stamps its version (DashMealWeek.stampVersion). Targets, the rest-day
// target, exclusions and the phase shift wait in one fold under the week.
// Pure rules: DashMealWeek (dashMealWeek.js, new) over DashMeals (dashMealCore.js, unchanged).
const DMB_TEAL = "var(--sh-accent-ink, #2ee0c4)";
const DMB_STATUS = {
  on: { c: "var(--sh-accent-ink, #2ee0c4)" }, under: { c: "var(--sh-gold, #d8a23a)" }, over: { c: "var(--sh-rust, #e0644b)" },
  lowp: { c: "var(--sh-rust, #e0644b)" }, empty: { c: "var(--sh-ink2, #a09b94)" }, none: { c: "var(--sh-ink2, #a09b94)" },
};
const dmbFmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
// A status is a labelled chip, never a bare colour.
function DmbStatusChip({ status }) {
  if (!status) return null;
  const c = (DMB_STATUS[status.key] || DMB_STATUS.none).c;
  return <span className="dmb-chip" data-status={status.key} style={{ "--chip": c }}>{status.label}</span>;
}

// The picked day's ring: calories of the day's own target, protein, carbs and fat round it, and the
// day's status in words.
function DmbDayRing({ name, status, target, kindLabel }) {
  const t = status ? status.totals : { kcal: 0, p: 0, c: 0, f: 0 };
  const goal = Number(target && target.kcal) || 0;
  const r = 44, len = 2 * Math.PI * r;
  const frac = goal > 0 ? Math.min(1, t.kcal / goal) : 0;
  const c = (DMB_STATUS[status ? status.key : "none"] || DMB_STATUS.none).c;
  return (
    <div className="dmb-ring" data-ring="">
      <div className="dmb-eyebrow">{name} · {kindLabel}</div>
      <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={name + ": " + dmbFmt(t.kcal) + " of " + dmbFmt(goal) + " kcal"}>
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(var(--sh-ink-rgb, 242,237,228),0.1)" strokeWidth="9" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={c} strokeWidth="9" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - frac)} transform="rotate(-90 56 56)" />
        <text x="56" y="54" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="17" fontWeight="700" fill="var(--sh-ink, #f2ede4)">{dmbFmt(t.kcal)}</text>
        <text x="56" y="70" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="8.5" fill="var(--sh-ink2, #a09b94)">of {dmbFmt(goal)} kcal</text>
      </svg>
      <p className="dmb-ring-line" style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>{name}: {dmbFmt(t.kcal)} of {dmbFmt(goal)} kcal</p>
      <DmbStatusChip status={status} />
      <dl>
        <div><dt>Protein</dt><dd>{t.p}<span>/{Number(target && target.p) || 0} g</span></dd></div>
        <div><dt>Carbs</dt><dd>{t.c}<span>/{Number(target && target.c) || 0} g</span></dd></div>
        <div><dt>Fat</dt><dd>{t.f}<span>/{Number(target && target.f) || 0} g</span></dd></div>
      </dl>
    </div>
  );
}

// Shape Kitchen beside the week: the catalog (Kitchen N) and the nutritionist's own (Mine), a
// search, and three filters. A recipe is dragged onto a meal, or picked to go where the panel says.
function DmbKitchenPanel({ kitchen, mine, constraints, target, onAdd, onPreview, customFoods }) {
  const [tab, setTab] = React.useState("kitchen");
  const [q, setQ] = React.useState("");
  const [on, setOn] = React.useState({});
  const [own, setOwn] = React.useState(false);
  const W = DashMealWeek;
  const list = tab === "kitchen" ? (kitchen || []) : (mine.foods || []);
  const shown = W.searchKitchen(list, q, on, constraints);
  // A dish of the coach's own has no catalog lists: every exclusion on it is read from its name and ingredients.
  const readOff = tab === "kitchen" ? W.readFromIngredients(constraints) : ((constraints && constraints.exclusions) || []);
  const listed = tab === "kitchen" ? ((constraints && constraints.exclusions) || []).filter((a) => readOff.indexOf(a) < 0) : [];
  const where = target ? target.dayName + " · " + target.slot : null;
  const card = (f) => (
    <button key={f.id} type="button" className="dmb-recipe" draggable="true" data-recipe={f.name}
      onDragStart={(e) => { try { e.dataTransfer.setData("text/plain", f.name); e.dataTransfer.effectAllowed = "copy"; } catch (x) {} onPreview(f, true); }}
      onDragEnd={() => onPreview(null, true)}
      onMouseEnter={() => onPreview(f)} onMouseLeave={() => onPreview(null)} onFocus={() => onPreview(f)} onBlur={() => onPreview(null)}
      onClick={() => onAdd(f)} title={where ? "Add to " + where : undefined}>
      {f.photo ? <img src={f.photo} alt="" /> : null}
      <b>{f.name}</b>
      <em>{DashMeals.foodHasMacros(f) ? dmbFmt(f.kcal) + " kcal · " + f.p + " g P" : "Macros not set"}</em>
      <small>{[f.kitchen && f.kitchen.diet, f.kitchen ? f.kitchen.time : (f.prepMin != null ? f.prepMin + " min" : null), f.own ? "Yours" : null].filter(Boolean).join(" · ")}</small>
    </button>
  );
  return (
    <div className="dmb-box dmb-kitchen" data-kitchen="">
      <div className="dmb-tabs" role="tablist" aria-label="Recipes">
        <button type="button" role="tab" aria-selected={tab === "kitchen"} onClick={() => setTab("kitchen")}>Kitchen {kitchen ? kitchen.length : ""}</button>
        <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>Mine{mine.foods ? " " + mine.foods.length : ""}</button>
      </div>
      <input aria-label="Search Shape Kitchen" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "kitchen" ? "Search Kitchen recipes…" : "Search your recipes…"} style={{ ...dmbField, width: "100%" }} />
      <div className="dmb-filters" role="group" aria-label="Kitchen filters">
        {W.KITCHEN_FILTERS.map((fl) => <button key={fl.key} type="button" aria-pressed={!!on[fl.key]} onClick={() => setOn({ ...on, [fl.key]: !on[fl.key] })}>{fl.label}</button>)}
      </div>
      <p className="dmb-quiet" data-kitchen-target="">{where ? <>Adding to <b>{where}</b>. Drag a recipe onto any meal, or pick one here.</> : "Pick a meal in the week, or drag a recipe onto one."}</p>
      {((constraints && constraints.exclusions) || []).length > 0 && <p className="dmb-quiet" data-allergen-note="">Filtered · no {constraints.exclusions.join(", ")}{listed.length ? " · " + listed.join(", ") + " " + DMB_LISTED_NOTE : ""}{readOff.length ? " · " + readOff.join(", ") + " " + DMB_ALLERGEN_NOTE : ""}</p>}
      {tab === "kitchen" && !kitchen && <p className="dmb-quiet" role="status">Shape Kitchen didn’t load on this page. Reload to search it.</p>}
      {tab === "mine" && mine.state === "preview" && <p className="dmb-quiet" role="status">Sign in to see your own recipes.</p>}
      {tab === "mine" && mine.state === "loading" && <p className="dmb-quiet" role="status">Reading your kitchen…</p>}
      {tab === "mine" && mine.state === "unread" && <p className="dmb-quiet" role="status">Couldn’t read the recipes in your kitchen. <button type="button" style={{ ...dmbBtn(false), minHeight: 28, padding: "2px 8px" }} onClick={mine.retry}>Retry</button></p>}
      {tab === "mine" && mine.state === "ready" && !(mine.foods || []).length && <p className="dmb-quiet">No recipes of your own yet. Add them in the Shape app (Make it yours → Your kitchen), or name a dish below.</p>}
      <div className="dmb-klist dash-thin-scroll">
        {shown.map(card)}
        {list.length > 0 && !shown.length && <p className="dmb-quiet">No recipe matches.</p>}
      </div>
      {tab === "mine" && (
        <span style={{ position: "relative", display: "block", marginTop: 8 }}>
          <button type="button" onClick={() => setOwn(!own)} style={{ ...dmbBtn(false), width: "100%" }}>＋ A dish of your own</button>
          {own && <DmbFoodPicker constraints={constraints} customFoods={customFoods} onPick={(f) => { setOwn(false); onAdd(f); }} onClose={() => setOwn(false)} />}
        </span>
      )}
    </div>
  );
}

// The coach's own kitchen recipes (profile_custom.kitchen.recipes), read with the account the
// library belongs to. undefined while it runs is "loading", null "unread", and a read with none is
// an empty list. ⚠ A COPY OF A user_goals DOC IS READ AGAIN WHEN SOMETHING ELSE WRITES IT (WORKLOG):
// a setup in Nora's chat announces shape:accountSetup.
function useDmbOwnKitchen(live, ownerId) {
  const [recipes, setRecipes] = React.useState(undefined);
  const [rev, setRev] = React.useState(0);
  React.useEffect(() => { const again = () => setRev((n) => n + 1); window.addEventListener("shape:accountSetup", again); return () => window.removeEventListener("shape:accountSetup", again); }, []);
  React.useEffect(() => {
    if (!live || !ownerId) return undefined;
    let on = true;
    setRecipes(undefined);
    (async () => {
      const db = window.shapeDb;
      try {
        if (!db || typeof db.getUserGoals !== "function") { if (on) setRecipes(null); return; }
        try { if (typeof db.getSession === "function") await db.getSession(); } catch (e) { /* read on */ }
        const doc = await db.getUserGoals("profile_custom", { expectedUserId: ownerId });
        if (!on) return;
        if (doc == null || typeof doc !== "object") { setRecipes(null); return; }
        const lib = window.ShapeProfileLib;
        const k = lib && typeof lib.bsProfileKitchen === "function" ? lib.bsProfileKitchen(doc.kitchen, ownerId) : null;
        setRecipes(k && Array.isArray(k.recipes) ? k.recipes : (lib ? [] : null));
      } catch (e) { if (on) setRecipes(null); }
    })();
    return () => { on = false; };
  }, [live, ownerId, rev]);
  if (!live || !ownerId) return { state: "preview", recipes: null, retry: () => {} };
  return { state: recipes === undefined ? "loading" : recipes === null ? "unread" : "ready", recipes, retry: () => setRev((n) => n + 1) };
}

// The grocery list's first three items and how many more; the whole list, editable, opens in place.
function DmbGroceryPeek({ plan, onEdits }) {
  const [open, setOpen] = React.useState(false);
  const edits = plan.groceryEdits || {};
  const list = React.useMemo(() => DashMeals.buildMealAssignment(plan, { scale: 1, groceryEdits: Object.keys(edits).length ? edits : null }).grocery, [JSON.stringify(plan)]);
  const g = DashMealWeek.groceryTop(list, 3);
  return (
    <div className="dmb-box dmb-grocery" data-grocery="">
      <div className="dmb-eyebrow">Groceries · a week of this plan</div>
      {!list.length ? <p className="dmb-quiet">Nothing to buy yet. A meal’s ingredients land here.</p> : (
        <ul>{g.top.map((x) => <li key={x.name + "|" + x.unit}><span>{x.name}</span><span style={{ fontFamily: DMB_MONO, fontSize: 10, color: DMB_INK50 }}>{x.qty == null ? "" : x.qty + " " + (x.unit || "×")}</span></li>)}</ul>
      )}
      {list.length > 0 && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ ...dmbBtn(false), width: "100%" }}>{open ? "Close the list" : g.more ? "+ " + g.more + " more" : "Edit the list"}</button>}
      {open && <div style={{ marginTop: 10 }}><DmbGroceryPanel plan={plan} edits={edits} onEdits={onEdits} /></div>}
    </div>
  );
}

function DmbBuilder({ template, preselectId, clients, queue, lifecycle, live, onBack, onSaved, assignClientId, customFoods, ownerId, emptyNote, onAssigned, who }) {
  const W = DashMealWeek;
  const [saveError, setSaveError] = React.useState("");
  const [name, setName] = React.useState(template.name);
  const persistedAtOpen = !!template.id && !String(template.id).startsWith("demo-");
  const opened = React.useRef(null);
  if (!opened.current) opened.current = W.opening(template.detail.mealBuilder, persistedAtOpen);
  const [doc, setDocRaw] = React.useState(() => JSON.parse(JSON.stringify(template.detail.mealBuilder)));
  // ⚠ EVERY EDIT GOES THROUGH THE VERSION STAMP. A library plan that changes is the next version, so
  // the assignment's "snapshot vN" names what the client got; the old Publish vN button did this by
  // hand, and a plan edited and sent without it went out under the old number.
  const setDoc = (next) => setDocRaw((prev) => W.stampVersion(typeof next === "function" ? next(prev) : next, opened.current));
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
  const [pick, setPick] = React.useState(null); // { meal: id } | { slot } | null, on day `sel`
  const [previewVariant, setPreviewVariant] = React.useState("training");
  const [preview, setPreview] = React.useState(false);
  const [saveState, setSaveState] = React.useState("saved");
  const [assigning, setAssigning] = React.useState(!!assignClientId);
  const [hoverFood, setHoverFood] = React.useState(null);
  const [drag, setDrag] = React.useState(null); // { food, day, slot }
  const persisted = React.useRef(persistedAtOpen);
  const idRef = React.useRef(persisted.current ? template.id : crypto.randomUUID());
  const ownerRef = React.useRef(ownerId);
  // The revision it opened, then the one each save returns: a plan saved elsewhere since (in the app's
  // editor, or another tab) is refused with the route's words, never written over (Codex on #2594).
  const revRef = React.useRef(Number(template.detail && template.detail.revision) || 0);
  const latest = React.useRef({name,doc}); latest.current = {name,doc};
  const saved = React.useRef(JSON.stringify({name,doc}));
  const flight = React.useRef(null), active = React.useRef(true);
  React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  // Save, autosave, leave and assign share one lane. Reusing a template must POST
  // its fresh id only once, even when a save is asked for during the debounce.
  const flush = async () => {
    if(flight.current){if(!await flight.current)return false;if(saved.current!==JSON.stringify(latest.current))return flush();return true;}
    const value=latest.current, serial=JSON.stringify(value);
    if(persisted.current && saved.current===serial)return true;
    if(!value.name.trim()){setSaveError("Give this meal plan a name.");return false;}
    setSaveError("");setSaveState("saving");
    flight.current=(async()=>{
      try{
        if(live){
          const res=await fetch("/api/coach/plans",{method:persisted.current?"PATCH":"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:idRef.current,kind:"meal_plan",name:value.name,expectedOwnerId:ownerRef.current,...(persisted.current?{expectedRevision:revRef.current}:{}),meta:value.doc.targets.kcal+" kcal · "+dmbPhase(value.doc.goalPhase).label,detail:{...(template.detail||{}),mealBuilder:value.doc}})});
          const data=await res.json();
          if(!res.ok || !data.plan?.id)throw Error(data.error || "Save failed. Keep this page open and retry to save your edits.");
          idRef.current=data.plan.id;persisted.current=true;revRef.current=Number(data.plan.detail&&data.plan.detail.revision)||0;
        } else if(!dmbWriteDraft(idRef.current,value.name,value.doc))throw Error("This browser could not retain your draft. Keep this page open.");
        saved.current=serial;
        if(active.current){setSaveState("saved");onSaved?.({id:idRef.current,name:value.name,doc:value.doc,revision:revRef.current});}
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

  // ── The week, as each day is served in the view ──
  const variantOk = (d, v) => v === "training" || !!(d && d.variants && d.variants[v]);
  const view = previewVariant;
  const kind = view === "rest" ? "rest" : "training";
  const target = W.targetsFor(doc, kind);
  const floor = doc.constraints ? doc.constraints.proteinFloor : null;
  const n = doc.days.length;
  const cols = doc.days.map((d, i) => {
    const v = variantOk(d, view) ? view : "training";
    const meals = DashMeals.resolveDay(d, v);
    return { index: i, name: d.name, day: d, variant: v, meals, status: W.dayStatus(meals, target, floor), served: W.servedLabel(n, i) };
  });
  const rows = W.slotRows(cols.map((c) => c.meals));
  const day = doc.days[sel];
  const col = cols[sel];
  const curVariant = day && variantOk(day, view) ? view : "training";
  // What the picked day is, for its ring and the client preview: a rest day is a rest day (and
  // measured against `target`, the rest-day one) even with no rest version of its meals.
  const dayLabel = kind === "rest" ? "rest day" : curVariant === "training" ? "training day" : curVariant + " day";
  const brief = W.weekBrief(cols);
  const hasTravel = doc.days.some((d) => d.variants && d.variants.travel);
  const viewLabel = view === "rest" ? "rest day" : view === "travel" ? "travel day" : "training day";

  const setDay = (i, next) => setDoc({ ...doc, days: doc.days.map((d, j) => (j === i ? next : d)) });
  const setTargets = (k, v) => setDoc({ ...doc, targets: { ...doc.targets, [k]: Math.max(0, Number(v) || 0) } });
  // A field the coach has just cleared stays empty while they type (Codex on #2648): as 0 it read as
  // no rest target, which closed the editor and lost the other three.
  const setRest = (k, v) => setDoc({ ...doc, restTargets: { ...(doc.restTargets || doc.targets), [k]: v === "" ? "" : Math.max(0, Number(v) || 0) } });
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
  // ⚠ A WHOLE DAY GOES THROUGH ShapeConfirm, never confirm(): every meal on it goes with it.
  const deleteDay = async (i) => {
    if (doc.days.length < 2) return;
    const d = doc.days[i];
    const C = window.ShapeConfirm;
    if (!C || typeof C.open !== "function") return;
    const ok = await C.open({ title: "Delete this day?", name: d.name, confirmLabel: "Delete day", message: d.slots.length ? "Its " + d.slots.length + (d.slots.length === 1 ? " meal goes" : " meals go") + " with it. A client you already sent the plan to keeps what they have." : "A client you already sent the plan to keeps what they have." });
    if (!ok) return;
    setDoc((prev) => ({ ...prev, days: prev.days.filter((_, j) => j !== i) }));
    setSel(0); setPick(null);
  };
  const shift = (deltas) => setDoc(DashMealWeek.phaseShift(DashMeals, doc, deltas));

  // ── Placing a recipe: the row is the meal ──
  // Where the Kitchen adds: the cell picked, else the picked day's first empty meal.
  const targetSlot = pick && pick.slot ? pick.slot : col ? W.firstEmptyRow(col.meals) : "Snack";
  const kitchenTarget = day ? { day: sel, slot: targetSlot, dayName: day.name } : null;
  const place = (food, dayIndex, slot) => {
    const d = doc.days[dayIndex];
    if (!d || !food) return;
    const v = variantOk(d, view) ? view : "training";
    const meal = W.placeMeal(food, slot, DashMeals.newMeal);
    if (v === "training") setDay(dayIndex, { ...d, slots: [...d.slots, meal] });
    else {
      const vd = d.variants[v];
      setDay(dayIndex, { ...d, variants: { ...d.variants, [v]: { ...vd, extras: [...(vd.extras || []), meal] } } });
    }
    setSel(dayIndex); setPick({ meal: meal.id });
  };
  const projFor = (i) => {
    const f = drag && drag.day === i ? drag.food : (!drag && hoverFood && kitchenTarget && kitchenTarget.day === i ? hoverFood : null);
    return f ? W.projectDay(cols[i].meals, f) : null;
  };

  // ── Who it goes to ──
  const named = (clients || []).find((c) => c.profile && c.profile.id === (assignClientId || preselectId));
  const first = named ? String(named.profile.name || "").split(/\s+/)[0] : null;
  const assignLabel = first ? "Assign to " + first : "Assign to clients";
  const openAssign = async () => { if (await flush()) setAssigning(true); };

  // ── Shape Kitchen and the coach's own ──
  const kitchen = React.useMemo(() => (Array.isArray(window.SHAPE_RECIPES) ? W.kitchenFoods(window.SHAPE_RECIPES, typeof window.recipeNeeds === "function" ? window.recipeNeeds : null) : null), []);
  const own = useDmbOwnKitchen(!!live && !!ownerId, ownerId);
  // The coach's saved playlists, read once, for the day's and each meal's playlist picker. Signed out
  // (the preview) there are none to read; a failed read leaves the list empty, and a day or meal keeps
  // showing the playlist it has.
  const [playlists, setPlaylists] = React.useState([]);
  React.useEffect(() => {
    if (!live) { setPlaylists((prev) => (prev.length ? [] : prev)); return undefined; }
    let on = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/soundtracks", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        if (on) setPlaylists(dmbPlaylistChoices(data && data.soundtracks));
      } catch (e) { /* the list stays empty */ }
    })();
    return () => { on = false; };
  }, [live]);
  const mine = React.useMemo(() => {
    const fromKitchen = own.state === "ready" ? (own.recipes || []).map(W.ownRecipeFood).filter(Boolean) : [];
    // ⚠ A KITCHEN RECIPE PUT ON A PLAN IS STILL SHAPE'S, not the coach's: the plans' dishes are read
    // back as their own foods (DashMeals.ownFoodsFor), so the catalog's names are taken out of Mine.
    const shapes = new Set((kitchen || []).map((f) => f.name.toLowerCase()));
    const foods = own.state === "preview" ? null : DashMeals.mergeOwnFoods([fromKitchen, ownFoods]).filter((f) => !shapes.has(String(f.name).toLowerCase()));
    return { state: own.state, foods, retry: own.retry };
  }, [own.state, own.recipes, ownFoods, kitchen]);

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved edits" : saveState === "error" ? "Save failed" : live ? (persisted.current ? "Saved" : "Not saved yet") : "Draft on this device";
  // One list with the library's Diet filter (DashMeals.ALLERGENS), so a plan built to
  // exclude an allergen and a filter asking for plans without it name the same ones.
  const EXCLUSION_TAGS = DashMeals.ALLERGENS;
  const phase = dmbPhase(doc.goalPhase);
  const warnings = day ? DashMeals.checkConstraints(doc, col.meals) : [];
  const restOwn = W.hasRestTargets(doc);
  // The editor is open while the plan has a rest target at all; it measures only once its kcal is set.
  const restOn = !!(doc.restTargets && typeof doc.restTargets === "object");

  return (
    <div className="dmb-tool" data-builder="meal">
      <style>{`
.dmb-tool{color:var(--sh-ink, #f2ede4);font-family:var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif);min-width:0}
.dmb-tool *{box-sizing:border-box}
.dmb-tool [hidden]{display:none!important}
.dmb-tool :focus-visible{outline:2px solid var(--sh-accent, #2ee0c4);outline-offset:2px}
.dmb-tool .dmb-brief{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px;padding:10px 14px;border-radius:8px;background:var(--sh-card, #25211d);border:1px solid var(--sh-line, #302c27)}
.dmb-tool .dmb-brief p{margin:0;font-size:14px;font-weight:600;flex:1 1 280px}
.dmb-tool .dmb-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.dmb-tool .dmb-body{display:grid;grid-template-columns:minmax(0,1fr) 312px;gap:16px;align-items:start}
.dmb-tool .dmb-main,.dmb-tool .dmb-rail{min-width:0;display:flex;flex-direction:column;gap:12px}
.dmb-tool .dmb-rail{position:sticky;top:12px}
.dmb-tool .dmb-box{background:var(--sh-card, #25211d);border:1px solid var(--sh-line, #302c27);border-radius:10px;padding:12px 14px;min-width:0}
.dmb-tool .dmb-eyebrow{font:700 8.5px 'JetBrains Mono', monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--sh-ink2, #a09b94)}
.dmb-tool .dmb-seg{display:inline-flex;border:1px solid var(--sh-line2, #413d38);border-radius:6px;overflow:hidden}
.dmb-tool .dmb-seg button{font:600 12px var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif);min-height:32px;padding:4px 12px;border:0;background:transparent;color:var(--sh-ink2, #a09b94);cursor:pointer}
.dmb-tool .dmb-seg button[aria-pressed=true]{background:rgba(var(--sh-accent-rgb, 46,224,196),0.14);color:var(--sh-accent-ink, #2ee0c4)}
.dmb-tool .dmb-weekwrap{overflow-x:auto;margin:10px -4px 0;padding:0 4px 4px}
.dmb-tool table.dmb-week{width:100%;min-width:640px;border-collapse:separate;border-spacing:4px;table-layout:fixed}
.dmb-tool .dmb-week th,.dmb-tool .dmb-week td{vertical-align:top;text-align:left;padding:0}
.dmb-tool .dmb-week th.dmb-rowhead{width:64px;font:700 8px 'JetBrains Mono', monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--sh-ink2, #a09b94);padding-top:8px}
.dmb-tool .dmb-dayhead{display:block;width:100%;text-align:left;min-height:64px;padding:6px 7px;border-radius:6px;border:1px solid var(--sh-line, #302c27);background:transparent;color:var(--sh-ink, #f2ede4);cursor:pointer;font:inherit}
.dmb-tool .dmb-dayhead[aria-pressed=true]{border-color:var(--sh-gold, #d8a23a);background:rgba(var(--sh-gold-rgb, 216,162,58),0.08)}
.dmb-tool .dmb-dayhead b{display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dmb-tool .dmb-dayhead small{display:block;font:500 8px 'JetBrains Mono', monospace;letter-spacing:.06em;color:var(--sh-ink2, #a09b94);margin:2px 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dmb-tool .dmb-dayhead .dmb-kcal{display:block;font:600 10.5px 'JetBrains Mono', monospace;margin-bottom:4px;white-space:nowrap}
.dmb-tool .dmb-dayhead .dmb-kcal span{color:var(--sh-ink2, #a09b94)}
.dmb-tool .dmb-cell{min-height:58px;border-radius:6px;border:1px dashed var(--sh-line2, #413d38);padding:3px;display:flex;flex-direction:column;gap:3px}
.dmb-tool .dmb-cell.is-filled{border-style:solid;border-color:var(--sh-line, #302c27)}
.dmb-tool .dmb-cell.is-target{border-color:var(--sh-accent, #2ee0c4);border-style:solid;background:rgba(var(--sh-accent-rgb, 46,224,196),0.06)}
.dmb-tool .dmb-meal{display:block;width:100%;text-align:left;padding:5px 6px;border-radius:5px;border:0;background:rgba(var(--sh-ink-rgb, 242,237,228),0.05);color:var(--sh-ink, #f2ede4);cursor:pointer;font:inherit}
.dmb-tool .dmb-meal[aria-pressed=true]{background:rgba(var(--sh-gold-rgb, 216,162,58),0.16);box-shadow:inset 0 0 0 1px var(--sh-gold, #d8a23a)}
.dmb-tool .dmb-meal b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11.5px;font-weight:600;line-height:1.25}
.dmb-tool .dmb-meal small{display:block;font:500 8.5px 'JetBrains Mono', monospace;color:var(--sh-ink2, #a09b94);margin-top:2px}
.dmb-tool .dmb-marks{font:500 8.5px 'JetBrains Mono', monospace;color:var(--sh-accent-ink, #2ee0c4);margin-left:4px}
.dmb-tool .dmb-add{width:100%;flex:1;min-height:26px;border:0;border-radius:4px;background:transparent;color:var(--sh-ink2, #a09b94);cursor:pointer;font:600 11px var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)}
.dmb-tool .dmb-add:hover{background:rgba(var(--sh-ink-rgb, 242,237,228),0.05)}
.dmb-tool .dmb-chip{display:inline-block;white-space:nowrap;font:700 8px 'JetBrains Mono', monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--chip);border:1px solid var(--chip);border-left-width:3px;border-radius:4px;padding:2px 6px}
.dmb-tool .dmb-dayhead .dmb-proj{color:var(--sh-accent-ink, #2ee0c4);font-weight:700}
.dmb-tool .dmb-peek{display:grid;grid-template-columns:200px minmax(0,1fr);gap:14px;align-items:start}
.dmb-tool .dmb-ring{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.dmb-tool .dmb-ring svg{display:block}
.dmb-tool .dmb-ring dl{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:0;width:100%}
.dmb-tool .dmb-ring dt{font:700 7.5px 'JetBrains Mono', monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--sh-ink2, #a09b94)}
.dmb-tool .dmb-ring dd{margin:0;font:600 11px 'JetBrains Mono', monospace}
.dmb-tool .dmb-ring dd span{color:var(--sh-ink2, #a09b94);font-weight:500}
.dmb-tool .dmb-tabs{display:flex;gap:4px;margin-bottom:8px}
.dmb-tool .dmb-tabs button{flex:1;min-height:32px;border-radius:6px;border:1px solid var(--sh-line2, #413d38);background:transparent;color:var(--sh-ink2, #a09b94);font:600 12px var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif);cursor:pointer}
.dmb-tool .dmb-tabs button[aria-selected=true]{border-color:var(--sh-accent, #2ee0c4);color:var(--sh-accent-ink, #2ee0c4);background:rgba(var(--sh-accent-rgb, 46,224,196),0.08)}
.dmb-tool .dmb-filters{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0}
.dmb-tool .dmb-filters button{min-height:28px;padding:2px 9px;border-radius:14px;border:1px solid var(--sh-line2, #413d38);background:transparent;color:var(--sh-ink2, #a09b94);font:600 11px var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif);cursor:pointer}
.dmb-tool .dmb-filters button[aria-pressed=true]{border-color:var(--sh-accent, #2ee0c4);color:var(--sh-accent-ink, #2ee0c4)}
.dmb-tool .dmb-klist{max-height:min(52vh,460px);overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-top:6px}
.dmb-tool .dmb-recipe{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;width:100%;text-align:left;padding:7px 8px;border-radius:6px;border:1px solid var(--sh-line, #302c27);background:transparent;color:var(--sh-ink, #f2ede4);cursor:grab;font:inherit}
.dmb-tool .dmb-recipe:hover,.dmb-tool .dmb-recipe:focus-visible{border-color:var(--sh-accent, #2ee0c4)}
.dmb-tool .dmb-recipe b{font-size:12px;font-weight:600;line-height:1.25}
.dmb-tool .dmb-recipe small{font:500 8.5px 'JetBrains Mono', monospace;color:var(--sh-ink2, #a09b94);grid-column:1/-1}
.dmb-tool .dmb-recipe em{font:600 9.5px 'JetBrains Mono', monospace;font-style:normal;white-space:nowrap}
.dmb-tool .dmb-recipe img{width:34px;height:34px;object-fit:cover;border-radius:4px;grid-row:span 2}
.dmb-tool .dmb-quiet{font-size:12px;color:var(--sh-ink2, #a09b94);line-height:1.45;margin:4px 0}
.dmb-tool .dmb-grocery li{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:4px 0;border-top:1px solid var(--sh-line, #302c27)}
.dmb-tool .dmb-grocery ul{list-style:none;margin:6px 0;padding:0}
.dmb-tool details.dmb-settings>summary{cursor:pointer;font-weight:600;font-size:13px;padding:4px 0}
.dmb-tool .dmb-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:10px}
@media(max-width:1180px){
 .dmb-tool .dmb-body{grid-template-columns:1fr}
 .dmb-tool .dmb-rail{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:auto 1fr;grid-template-areas:"assign kitchen" "grocery kitchen";align-items:start}
 .dmb-tool .dmb-rail>[data-assign]{grid-area:assign}
 .dmb-tool .dmb-rail>.dmb-kitchen{grid-area:kitchen}
 .dmb-tool .dmb-rail>.dmb-grocery{grid-area:grocery}
}
@media(max-width:760px){
 .dmb-tool .dmb-rail{display:flex}
 .dmb-tool .dmb-peek{grid-template-columns:1fr}
}
`}</style>
      {template.sourceName && <p className="dmb-quiet">Based on <strong>{template.sourceName}</strong>. You’re editing a new copy; the original stays unchanged.</p>}
      {/* The brief: one sentence, one action. */}
      <div className="dmb-brief" role="status" data-brief="">
        <p>{brief.text}</p>
        {brief.day != null && <button type="button" style={dmbBtn(false)} onClick={() => { setSel(brief.day); setPick(null); }}>Open {cols[brief.day].name}</button>}
      </div>
      <div className="dmb-head">
        <button onClick={leave} style={dmbBtn(false)}>← Library</button>
        <input aria-label="Meal plan name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...dmbField, fontSize: 20, fontWeight: 600, minWidth: 0, flex: "1 1 220px", maxWidth: 520 }} />
        <select aria-label="Goal phase" value={doc.goalPhase} onChange={(e) => {
          const p = dmbPhase(e.target.value);
          setDoc({ ...doc, goalPhase: p.key, targets: { ...p.targets }, constraints: { ...doc.constraints, proteinFloor: p.targets.p - 20 } });
        }} style={{ ...dmbField, fontFamily: DMB_MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: phase.c, padding: "6px 8px" }}>
          {DashMeals.GOAL_PHASES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <span className="dmb-chip" data-save={saveState} title="Each change saves; a library plan that changes is its next version, and an assignment sends that version." style={{ "--chip": saveState === "error" ? DMB_RED : saveState === "saved" ? DMB_TEAL : DMB_INK50 }}>v{doc.version || 1} · {saveLabel}</span>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DMB_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: preview ? DMB_TEAL : DMB_INK50, cursor: "pointer" }}>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Client preview
        </label>
      </div>
      {saveError && <p role="alert">{saveError} <button style={dmbBtn(false)} onClick={flush}>Retry save</button></p>}

      <div className="dmb-body">
        <div className="dmb-main">
          {/* The week: the plan's days across, the meals down. */}
          <div className="dmb-box" data-week="">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="dmb-eyebrow">The week</span>
              <div className="dmb-seg" role="group" aria-label="Which day the week shows">
                <button type="button" aria-pressed={view === "training"} onClick={() => setPreviewVariant("training")}>Training days · {dmbFmt(doc.targets.kcal)}</button>
                <button type="button" aria-pressed={view === "rest"} onClick={() => setPreviewVariant("rest")}>Rest days · {dmbFmt(W.targetsFor(doc, "rest").kcal)}{restOwn ? "" : " (same)"}</button>
                {hasTravel && <button type="button" aria-pressed={view === "travel"} onClick={() => setPreviewVariant("travel")}>Travel days</button>}
              </div>
              <span className="dmb-quiet" style={{ margin: 0 }}>Protein {dmbFmt(target.p)} g{view === "rest" && !restOwn ? " · rest days use the training target until you set one" : ""}</span>
              <div style={{ flex: 1 }} />
              {n < 7 && n > 0 && <button type="button" style={{ ...dmbBtn(false), minHeight: 30, padding: "4px 10px", fontSize: 12 }} title="Seven days, Monday to Sunday, each a copy of the day it is served today — what a client gets stays the same" onClick={() => { setDoc(W.spreadWeek(doc)); setSel(0); setPick(null); }}>Spread over 7 days</button>}
              {n < 7 && <button type="button" style={{ ...dmbBtn(false), minHeight: 30, padding: "4px 10px", fontSize: 12 }} onClick={() => setDoc({ ...doc, days: [...doc.days, DashMeals.newDay(n === 0 ? "Day A" : "Day " + String.fromCharCode(65 + n))] })}>+ Day</button>}
            </div>
            <div className="dmb-weekwrap dash-thin-scroll">
              <table className="dmb-week" aria-label="The week">
                <thead><tr>
                  <th className="dmb-rowhead" scope="col"><span hidden>Meal</span></th>
                  {cols.map((c) => {
                    const pj = projFor(c.index);
                    return (
                      <th key={c.index} scope="col">
                        <button type="button" className="dmb-dayhead" aria-pressed={sel === c.index && !pick} data-day={c.name}
                          onClick={() => { setSel(c.index); setPick(null); }}>
                          <b>{c.name}</b>
                          <small>{c.served}</small>
                          {/* While a recipe is on its way here, the total reads what it would become, in place. */}
                          {pj
                            ? <span className="dmb-kcal dmb-proj" data-proj="">{dmbFmt(pj.from)} → {dmbFmt(pj.to)}</span>
                            : <span className="dmb-kcal">{dmbFmt(c.status.totals.kcal)}<span> / {dmbFmt(c.status.target)}</span></span>}
                          <DmbStatusChip status={c.status} />
                        </button>
                      </th>
                    );
                  })}
                </tr></thead>
                <tbody>
                  {rows.map((slot) => (
                    <tr key={slot}>
                      <th scope="row" className="dmb-rowhead">{slot}</th>
                      {cols.map((c) => {
                        const here = W.mealsIn(c.meals, slot);
                        const isTarget = drag ? drag.day === c.index && drag.slot === slot : !!kitchenTarget && kitchenTarget.day === c.index && kitchenTarget.slot === slot && !(pick && pick.meal);
                        return (
                          <td key={c.index}
                            onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.day !== c.index || drag.slot !== slot) setDrag({ ...drag, day: c.index, slot }); }}
                            onDrop={(e) => { e.preventDefault(); if (drag && drag.food) place(drag.food, c.index, slot); setDrag(null); setHoverFood(null); }}>
                            <div className={"dmb-cell" + (here.length ? " is-filled" : "") + (isTarget ? " is-target" : "")} data-cell={c.name + "|" + slot}>
                              {here.map((m) => (
                                <button key={m.id} type="button" className="dmb-meal" aria-pressed={sel === c.index && !!pick && pick.meal === m.id}
                                  onClick={() => { setSel(c.index); setPick({ meal: m.id }); }}>
                                  <b>{m.name}</b>
                                  <small>{DashMeals.foodHasMacros(m) ? dmbFmt(m.kcal) + " kcal · " + (Number(m.p) || 0) + " g P" : "Macros not set"}
                                    {(DashMeals.madeAheadMeal(m) || (m.swaps || []).length > 0 || (typeof m.note === "string" && m.note.trim()) || dmbHasPlaylist(m.playlist)) && (
                                      <span className="dmb-marks" aria-label={[DashMeals.madeAheadMeal(m) ? "prepped the night before" : null, (m.swaps || []).length ? (m.swaps.length + (m.swaps.length === 1 ? " swap" : " swaps")) : null, typeof m.note === "string" && m.note.trim() ? "a note to the client" : null, dmbHasPlaylist(m.playlist) ? "a playlist" : null].filter(Boolean).join(", ")}>
                                        {DashMeals.madeAheadMeal(m) ? "☾" : ""}{(m.swaps || []).length ? " ⇄" + m.swaps.length : ""}{typeof m.note === "string" && m.note.trim() ? " ✎" : ""}{dmbHasPlaylist(m.playlist) ? " ♪" : ""}
                                      </span>
                                    )}
                                  </small>
                                </button>
                              ))}
                              <button type="button" className="dmb-add" aria-label={(here.length ? "Add another to " : "Add to ") + c.name + " · " + slot}
                                onClick={() => { setSel(c.index); setPick({ slot }); }}>{here.length ? "＋" : "＋ " + slot}</button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* The picked day: its ring, and the one meal open (or the day's own settings). */}
          {day && (
            <div className="dmb-box dmb-peek" data-peek="">
              <DmbDayRing name={day.name} status={col.status} target={target} kindLabel={dayLabel} />
              <div style={{ minWidth: 0 }}>
                {(warnings || []).map((w, i) => <p key={i} className="dmb-quiet" style={{ color: DMB_RED }}>⚠ {w}</p>)}
                <DmbDayEditor day={day} onChange={(next) => setDay(sel, next)} plan={doc} variant={curVariant} setVariant={setPreviewVariant} customFoods={ownFoods}
                  only={pick && pick.meal ? pick.meal : null} onAdded={(id) => setPick({ meal: id })} playlists={playlists}
                  onDuplicate={() => duplicateDay(sel)} onDelete={doc.days.length > 1 ? () => deleteDay(sel) : null} />
                {!(pick && pick.meal) && <p className="dmb-quiet">Pick a meal in the week to open it here: its macros, swaps, night-before prep, a playlist and a note to the client.</p>}
              </div>
            </div>
          )}

          {preview && day && (
            <div className="dmb-box" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <DmbClientPreview doc={doc} day={day} variant={curVariant} targets={target} label={dayLabel} />
            </div>
          )}

          {/* Targets and rules: set once, so they wait in one fold under the week. */}
          <details className="dmb-box dmb-settings">
            <summary>Targets, rest days and rules · {dmbFmt(doc.targets.kcal)} kcal training{restOwn ? " · " + dmbFmt(doc.restTargets.kcal) + " rest" : ""}{(doc.constraints.exclusions || []).length ? " · no " + doc.constraints.exclusions.join(", ") : ""}</summary>
            <div className="dmb-settings-grid">
              <div>
                <span style={dmbLabel}>Training days</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[["kcal", "kcal"], ["p", "Protein g"], ["c", "Carbs g"], ["f", "Fat g"]].map(([k, l]) => (
                    <div key={k}><span style={dmbLabel}>{l}</span><input aria-label={"Daily " + l + " target"} type="number" value={doc.targets[k]} onChange={(e) => setTargets(k, e.target.value)} style={{ ...dmbField, width: "100%" }} /></div>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ ...dmbLabel, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={restOn} onChange={(e) => setDoc(e.target.checked ? { ...doc, restTargets: { ...doc.targets } } : (() => { const next = { ...doc }; delete next.restTargets; return next; })())} />
                  Rest days have their own target
                </label>
                {restOn ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[["kcal", "kcal"], ["p", "Protein g"], ["c", "Carbs g"], ["f", "Fat g"]].map(([k, l]) => (
                      <div key={k}><span style={dmbLabel}>{l}</span><input aria-label={"Rest-day " + l + " target"} type="number" value={doc.restTargets[k]} onChange={(e) => setRest(k, e.target.value)} style={{ ...dmbField, width: "100%" }} /></div>
                    ))}
                  </div>
                ) : <p className="dmb-quiet">Rest days are measured against the training target until you set one. A client’s rest days are the days their assign sheet leaves off.</p>}
              </div>
              <div>
                <span style={dmbLabel}>Protein floor (g/day)</span>
                <input aria-label="Protein floor" type="number" value={doc.constraints.proteinFloor != null ? doc.constraints.proteinFloor : ""} placeholder="—"
                  onChange={(e) => setConstraint("proteinFloor", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))} style={{ ...dmbField, width: 90 }} />
                <span style={{ ...dmbLabel, marginTop: 10 }}>Max prep (min)</span>
                <input aria-label="Max prep" type="number" value={doc.constraints.maxPrep != null ? doc.constraints.maxPrep : ""} placeholder="—"
                  onChange={(e) => setConstraint("maxPrep", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))} style={{ ...dmbField, width: 90 }} />
              </div>
              <div>
                <span style={dmbLabel}>Allergies & exclusions · filter the Kitchen</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {EXCLUSION_TAGS.map((tag) => {
                    const on = (doc.constraints.exclusions || []).indexOf(tag) >= 0;
                    return (
                      <button key={tag} type="button" aria-pressed={on} onClick={() => setConstraint("exclusions", on ? doc.constraints.exclusions.filter((t) => t !== tag) : [...(doc.constraints.exclusions || []), tag])}
                        style={{ ...dmbBtn(false), minHeight: 30, padding: "4px 8px", fontSize: 11, color: on ? DMB_RED : DMB_INK50, borderColor: on ? "rgba(var(--sh-rust-rgb, 224,100,75),0.45)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)" }}>
                        {on ? "× " : ""}{tag}
                      </button>
                    );
                  })}
                </div>
                <p className="dmb-quiet" data-allergen-note="">Exclusions are {DMB_ALLERGEN_NOTE}; Shape Kitchen’s dairy and gluten come from its own lists.</p>
                <span style={{ ...dmbLabel, marginTop: 10 }}>Phase shift · every day, version and swap</span>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => shift({ carbsPct: -10 })} style={{ ...dmbBtn(false), minHeight: 30, padding: "4px 8px", fontSize: 11 }}>−10% carbs</button>
                  <button type="button" onClick={() => shift({ carbsPct: 10 })} style={{ ...dmbBtn(false), minHeight: 30, padding: "4px 8px", fontSize: 11 }}>+10% carbs</button>
                  <button type="button" onClick={() => shift({ proteinPct: 10 })} style={{ ...dmbBtn(false), minHeight: 30, padding: "4px 8px", fontSize: 11 }}>+10% protein</button>
                  <button type="button" onClick={() => shift({ fatPct: -10 })} style={{ ...dmbBtn(false), minHeight: 30, padding: "4px 8px", fontSize: 11 }}>−10% fat</button>
                </div>
              </div>
            </div>
          </details>
        </div>

        <aside className="dmb-rail" aria-label="Assign, Shape Kitchen and groceries">
          {/* Who it goes to: who is on it now (real reads only), and one primary. */}
          <div className="dmb-box" data-assign="">
            <div className="dmb-eyebrow">Assign</div>
            {who || <p className="dmb-quiet">{live ? "Save it to your library to see who’s on it." : "Preview · no client plans to read"}</p>}
            <button type="button" onClick={openAssign} style={{ ...dmbBtn(true), width: "100%", marginTop: 6 }}>{assignLabel} →</button>
            <p className="dmb-quiet" style={{ fontSize: 11 }}>Each client gets {doc.days.length === 7 ? "this week" : "this " + doc.days.length + "-day rotation"} on their own training days, which you pick for them as you assign.</p>
          </div>
          <DmbKitchenPanel kitchen={kitchen} mine={mine} constraints={doc.constraints} target={kitchenTarget} customFoods={ownFoods}
            onAdd={(f) => { if (kitchenTarget) place(f, kitchenTarget.day, kitchenTarget.slot); setHoverFood(null); }}
            onPreview={(f, dragging) => {
              if (dragging) { setDrag(f ? { food: f, day: null, slot: null } : null); if (!f) setHoverFood(null); }
              else setHoverFood(f);
            }} />
          <DmbGroceryPeek plan={doc} onEdits={(e) => setDoc({ ...doc, groceryEdits: e })} />
        </aside>
      </div>

      {assigning && (
        <DmbAssignModal
          template={{ id: persisted.current ? idRef.current : null, name }} doc={doc} groceryEdits={doc.groceryEdits || {}}
          clients={clients} queue={queue} lifecycle={lifecycle} live={live}
          preselectId={assignClientId || preselectId} emptyNote={emptyNote} onAssigned={onAssigned}
          onClose={() => setAssigning(false)} />
      )}
    </div>
  );
}

// ── The library's to-do (the owner's coach review, step 6a: "the calmer library") ──
// "Two gold primaries on every card, and the whole roster as a to-do list." The lifecycle block
// listed 9 of 10 clients for a phase change and 8 of them again as expiring: 17 identical "Write
// plan →" buttons. It is one line now, each client counted once with every reason they have, a
// plan named only where one in their own phase exists (DashMeals.planTodo), and "Assign all"
// opening each one's own assign sheet in turn: the existing assign path, one client at a time,
// with the sheet's start day, training days and portion scale still the coach's to set.
const DMB_REASONS = { "checked-in": "Checked in this week", phase: "Near their goal · time for the next phase" };
const DMB_NOBODY = Object.freeze([]);
const DMB_SORTS = [
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name A–Z" },
  { key: "kcal", label: "Calories, low to high" },
];
const dmbCount = (n, one, many) => n + " " + (n === 1 ? one : many);
function DmbPerson({ p }) {
  return <span className="dash-lib-person">{typeof DashClientGem === "function" && <DashClientGem points={p.rankPoints} title={p.name} />}<b>{p.name}</b></span>;
}
function dmbTodoModel(roster, clients, queue, templates, sent) {
  if (roster === "loading" || roster === "unread") return { roster, todo: null };
  return { roster, todo: DashMeals.planTodo(clients, queue, templates, sent) };
}
function DmbTodoLine({ model, onAssignAll, onReview }) {
  const label = "Plans due this week";
  const by = dashLibWeekEnd();
  if (!model.todo) return <DashLibTopLine label={label} figure="—" line={"need a new plan by " + by} note={model.roster === "unread" ? DASH_LIB_ROSTER_UNREAD : "Reading your roster…"} />;
  const t = model.todo;
  const n = t.rows.length;
  const settling = t.pending > 0 && !n && !t.intake.length;
  const notes = [];
  if (t.pending) notes.push(dmbCount(t.pending, "client is", "clients are") + " still loading");
  if (t.unread) notes.push(dmbCount(t.unread, "client’s check-ins", "clients’ check-ins") + " couldn’t be read");
  if (t.intake.length) notes.push(dmbCount(t.intake.length, "client is", "clients are") + " waiting on their first check-in");
  if (!settling && !n && !t.pending && !t.unread) notes.push(t.total ? "Nobody needs a new plan this week." : "No clients on your roster yet.");
  const shown = t.rows.slice(0, 3);
  const chips = n ? <ul className="dash-lib-todos">
    {shown.map((r) => <li key={r.id} className="dash-lib-todo">
      <DmbPerson p={r} />
      <span className="dash-lib-todo-plan">{r.suggestion ? "→ " + r.suggestion.name : "→ no plan in their phase yet"}</span>
      <span className="dash-lib-todo-why">{r.reasons.map((k) => DMB_REASONS[k] || k).join(" · ")}</span>
    </li>)}
    {n > shown.length && <li className="dash-lib-todo-more">{"+" + (n - shown.length) + " more in Review"}</li>}
  </ul> : null;
  return <DashLibTopLine label={label} figure={settling ? "—" : n} line={(n === 1 && !settling ? "needs a new plan by " : "need a new plan by ") + by}
    chips={chips} note={notes.length ? notes.join(" · ") : null}
    actions={<>
      {t.assignable > 0 && <button type="button" onClick={onAssignAll} style={dmbBtn(true)}>Assign all {t.assignable}</button>}
      <button type="button" onClick={onReview} disabled={!n && !t.intake.length} style={dmbBtn(false)}>Review</button>
    </>} />;
}
// A client with no plan named: "Choose a plan" from the library, or, on a library with none yet,
// "Start a plan" in the builder in their own phase (a button that does nothing on an empty
// library is a dead one).
function DmbTodoDrawer({ todo, hasPlans, onAssign, onPick, onNew, onClose }) {
  return <DashLibDrawer title="Plans due this week" onClose={onClose}
    sub="Each client once, with every reason they have. A plan is named where your library holds one in their phase; the assign sheet still asks for the start day, training days and portions.">
    <ul className="dash-lib-rows">
      {todo.rows.map((r) => <li key={r.id} className="dash-lib-row">
        <div className="dash-lib-row-main">
          <DmbPerson p={r} />
          <span className="dash-lib-row-what">{r.suggestion ? "→ " + r.suggestion.name : "No plan in their phase yet"}</span>
        </div>
        <div className="dash-lib-row-side">
          {r.reasons.map((k) => <DashLibStatus key={k} tone="need">{DMB_REASONS[k] || k}</DashLibStatus>)}
          {r.suggestion
            ? <button type="button" style={dmbBtn(false)} onClick={() => onAssign(r)}>Assign</button>
            : hasPlans
              ? <button type="button" style={dmbBtn(false)} onClick={() => onPick(r.id)}>Choose a plan</button>
              : <button type="button" style={dmbBtn(false)} onClick={() => onNew(r)}>Start a plan</button>}
        </div>
      </li>)}
      {todo.intake.map((r) => <li key={r.id} className="dash-lib-row">
        <div className="dash-lib-row-main"><DmbPerson p={r} /><span className="dash-lib-row-what">No first check-in yet</span></div>
        <div className="dash-lib-row-side">
          <DashLibStatus>Intake pending</DashLibStatus>
          <button type="button" style={dmbBtn(false)} onClick={() => dashMessageClient(r.name, "nutritionist", "Quick nudge — your intake form is still open. Two minutes and I can build your first week.", r.id)}>Message</button>
        </div>
      </li>)}
    </ul>
  </DashLibDrawer>;
}

// ── Who is on a plan (the owner's rule, 2026-11-09: "only the coaches see who's on what plan or
// program") ──
// The usage read (/api/coach/plans/usage?role=nutritionist): this nutritionist's own clients'
// current plans, by the library plan each was sent from, matched to their own roster
// (DashMeals.planWho). The same states as Programs' DbuWho. ⚠ UNREAD IS NOT EMPTY: a current plan
// that names no library plan (sent before Shape recorded one, or from the app, which does not send
// one yet) counts toward `untracked`, so while any such plan exists a card with none recorded says
// that, never "No clients yet" (the page says why once, above the cards).
function DmbWho({ entry, usage, roster, clients, preview }) {
  let body;
  if (preview) body = <span className="dash-lib-quiet">Preview · no client plans to read</span>;
  else if (usage.state !== "ready") body = <span className="dash-lib-quiet">{usage.state === "error" ? "Couldn’t read who’s on it" : "Checking who’s on it…"}</span>;
  else {
    const who = DashMeals.planWho(entry, clients);
    // ⚠ A CAPPED READ CAN ONLY UNDER-COUNT: "5+ clients", and never "No clients yet".
    const many = who.count + (usage.capped ? "+ clients" : who.count === 1 ? " client" : " clients");
    const partly = usage.capped ? <span className="dash-lib-quiet">· not every plan was read</span> : null;
    if (!who.count) body = <span className="dash-lib-quiet">{usage.capped ? "None found on the plans read" : usage.untracked > 0 ? "None recorded yet" : "No clients yet"}</span>;
    else if (roster !== "live" && roster !== "demo") body = <span className="dash-lib-quiet">{many} · {roster === "unread" ? DASH_LIB_ROSTER_UNREAD : "Reading your roster…"}</span>;
    else if (!who.people) body = <><span>{many}</span>{partly}</>;
    else body = <><DashLibPeople people={who.people} extra={who.count - who.people.length} />{partly}</>;
  }
  return <div className="dash-lib-who"><span className="dash-lib-who-label">On it</span>{body}</div>;
}
// The page's one line for plans Shape can't place: how many current plans name no library plan.
function dmbUntrackedNote(n) {
  return n === 1
    ? "1 current plan doesn’t say which library plan it came from (sent before Shape kept track, or from the app), so it isn’t counted on these cards."
    : n + " current plans don’t say which library plan they came from (sent before Shape kept track, or from the app), so they aren’t counted on these cards.";
}

// ── The page ────────────────────────────────────────────────────────────────
// The facts line on a library card, in the filters' own words so a nutritionist can see
// why a card matched — and what the page could NOT check, said as such.
// ⚠ THE ALLERGEN LINE NAMES THE PLAN'S OWN MEALS (planOwnDiet), never an alternate: "Summer Cut
// contains shellfish" was one swap's shrimp tacos. The Diet filter still holds a "free of" claim
// to every meal a client can be served, alternates included (its help says so).
function dmbCardFacts(info) {
  const parts = [];
  const d = info.ownDiet, p = info.prep;
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
  // The client a plan is being chosen for: the link's (?client=), or the one the to-do picked.
  const [pickFor, setPickFor] = React.useState(null);
  const forClient = pickFor || (typeof dashRouteParam === "function" ? dashRouteParam("client") : null);
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
  // ⚠ WHO IS ON EACH PLAN IS ITS OWN READ, and an unread one is not "nobody" (as Programs reads
  // its own). A failed REFRESH keeps the reading the page already had, because a stale count is
  // still a count and a blank is a claim. A current plan is published, whatever its week, so no
  // `today` rides on this read. An answer without a real `untracked` count is not the meal
  // library's, and is read as a failure.
  const [usage, setUsage] = React.useState({ state: "idle" });
  const usageRead = React.useRef(0);
  const loadUsage = React.useCallback(async () => {
    const read = ++usageRead.current;
    setUsage((u) => (u.state === "ready" ? u : { state: "loading" }));
    try {
      const res = await fetch("/api/coach/plans/usage?role=nutritionist", { credentials: "same-origin" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.usage || typeof data.usage !== "object" || !Number.isInteger(data.untracked) || data.untracked < 0) throw new Error("usage");
      // `sentAt`: when each client's current plan was sent, so a client sent one this week is not due.
      const sentAt = data.sentAt && typeof data.sentAt === "object" ? data.sentAt : {};
      if (read === usageRead.current) setUsage({ state: "ready", map: data.usage, capped: !!data.capped, untracked: data.untracked, sentAt });
    } catch (e) { if (read === usageRead.current) setUsage((u) => (u.state === "ready" ? u : { state: "error" })); }
  }, []);
  // ⚠ THE PREVIEW IS THE SIGNED-OUT LIBRARY, NOTHING ELSE (dashLibRosterState): until the library
  // has answered, a visitor and a coach whose roster read failed look alike, so neither the band
  // nor a sample person shows; once it has, a signed-in library never names the sample cast.
  const signedIn = !!libraryOwner.current;
  const roster = source === "demo" && !resolved.current ? "loading" : dashLibRosterState(source, signedIn);
  const preview = roster === "demo";
  // ⚠ LIVE IS "NOT THE PREVIEW", NOT "THE DAY FEED ANSWERED". A signed-in coach whose roster read
  // failed (unread) may have no feed either, and on `!!live` alone the assign sheet said "DEMO ·
  // marks the queue only", the builder kept drafts on the device and the remembered choices stayed
  // shut (as Schedule now gates).
  const isLive = !!live || roster === "live" || roster === "unread";
  const people = roster === "live" || roster === "demo" ? clients : DMB_NOBODY;
  // What an empty client list in the assign sheet means: unread is not "no clients".
  const emptyNote = roster === "unread" ? DASH_LIB_ROSTER_UNREAD : roster === "loading" ? "Reading your roster…" : "No clients yet.";
  const peopleQueue = people === clients ? queue : DMB_NOBODY;
  const targetClient = people.find((c) => c.profile.id === forClient);
  const lifecycle = React.useMemo(() => DashMeals.buildPlanLifecycle(people || [], peopleQueue || []), [people, peopleQueue]);

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
        // open plan, the assign sheet, the filters, who was on what — may carry across.
        const owner = d.ownerId || null;
        // Everything this page holds for one account goes with it (Codex on #2645): an Assign all walk
        // still on the last account's clients and plans, this visit's sends, the drawer's pick, the
        // open review and the last notice, as well as the open plan, the sheet and who was on what.
        if (resolved.current && libraryOwner.current !== owner) { setView(null); setAssignFor(null); setFilters(DFB_EMPTY); usageRead.current++; setUsage({ state: "idle" }); setWalk(null); setSentNow(new Set()); setPickFor(null); setReviewing(false); setNotice(""); }
        resolved.current = true;
        libraryOwner.current = owner;
        setTemplates(rows);
        // Plans written in the app have no website builder document, so this page cannot
        // open them — it says how many rather than pretending they do not exist.
        setAppOnly(all.length - rows.length);
        setError("");
        if (owner) loadUsage();
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
  // A draft Nora just saved opens straight in the builder (?plan=, the Ask Nora plan,
  // step 5). Once per plan, and only when the library holds it: a plan not in it yet is read
  // once more (the save landed a moment ago) before the page says it cannot find it.
  const openPlan = typeof dashRouteParam === "function" ? dashRouteParam("plan") : null;
  const openedPlan = React.useRef(null);
  const openRetried = React.useRef(null);
  React.useEffect(() => {
    if (!openPlan || !templates || openedPlan.current === openPlan) return;
    const found = templates.find((t) => t.id === openPlan);
    if (found) { openedPlan.current = openPlan; setView({ template: found }); return; }
    if (openRetried.current !== openPlan) { openRetried.current = openPlan; setRefresh((n) => n + 1); return; }
    openedPlan.current = openPlan;
    setError("That meal plan isn't in your library yet. Refresh in a moment.");
  }, [openPlan, templates]);
  // A plan saved on the phone shows up here without a reload.
  React.useEffect(() => {
    const update = () => { if (!document.hidden) setRefresh((n) => n + 1); };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);

  // Every filter reads the plan's own facts (DashMeals.mealPlanFacts); the search finds a recipe
  // inside a plan too. ⚠ ONE ROW: search, the plan's type (its phase) with counts, and sort; the
  // four other filters wait behind More filters instead of a row of dropdowns and chips.
  const phaseFacet = React.useMemo(() => ({ ...DashMeals.mealPhaseFacet(), label: "Type", help: "The plan’s goal phase." }), []);
  const items = React.useMemo(() => (templates || []).map((t) => ({ t, ...DashMeals.mealPlanFacts(t) })), [templates]);
  const run = dfbRun(items, [phaseFacet, ...DashMeals.MEAL_FACETS], filters);
  const [sort, setSort] = React.useState("newest");
  const kcalOf = (t) => { const k = Number(t.detail.mealBuilder.targets && t.detail.mealBuilder.targets.kcal); return isFinite(k) && k > 0 ? k : Infinity; };
  const shown = sort === "name" ? [...run.shown].sort((a, b) => String(a.t.name).localeCompare(String(b.t.name)))
    : sort === "kcal" ? [...run.shown].sort((a, b) => kcalOf(a.t) - kcalOf(b.t)) : run.shown;
  // Every dish this nutritionist has written that Shape does not list.
  const customFoods = DashMeals.customFoodsFromTemplates(templates || []);
  const newPlan = (phaseKey) => ({ id: null, name: "New meal plan", detail: { mealBuilder: DashMeals.newPlan("New meal plan", phaseKey || "maintain") } });
  // ⚠ A CLIENT SENT A PLAN THIS WEEK IS NOT DUE ONE (Codex on #2645). The usage read says when each
  // client's current plan from this nutritionist was sent (`sentAt`, any device), and this visit's own
  // sends count at once, before that read lands: so the line never offers Assign all again to the
  // clients it was just sent to (a second send archives the first and notifies the client again).
  const [sentNow, setSentNow] = React.useState(() => new Set());
  // dashFilterBar.jsx's helpers, read at call time like the page's other shared globals.
  const weekStart = typeof dashLibWeekStartKey === "function" ? dashLibWeekStartKey() : "";
  const sentThisWeek = new Set(sentNow);
  if (usage.state === "ready" && usage.sentAt && weekStart && typeof dashLibDayKey === "function") for (const [id, at] of Object.entries(usage.sentAt)) { if (dashLibDayKey(at) >= weekStart) sentThisWeek.add(id); }
  // The week's job: each client who is due a plan, once.
  const todoModel = dmbTodoModel(roster, people, peopleQueue, templates || [], sentThisWeek);
  const [reviewing, setReviewing] = React.useState(false);
  // "Assign all": each client's own assign sheet in turn. The page holds the list and where it is;
  // each sheet is the existing one, preselected, and closing it offers the next.
  const [walk, setWalk] = React.useState(null); // { rows, at } | null
  const openWalk = (rows, at) => { const r = rows[at]; if (r) setAssignFor({ template: r.suggestion.template, clientId: r.id }); };
  const assignAll = () => {
    const rows = todoModel.todo ? todoModel.todo.rows.filter((r) => r.suggestion) : [];
    if (!rows.length) return;
    setWalk({ rows, at: 0 });
    openWalk(rows, 0);
  };
  const closeAssign = () => {
    setAssignFor(null);
    setWalk((w) => (w ? (w.at + 1 < w.rows.length ? { ...w, at: w.at + 1 } : null) : null));
  };
  // A plan sent changes who is on what and who is still due: those clients leave the line at once, the
  // usage is read again (the last reading stays meanwhile), and their overviews are read again.
  const assigned = (ids) => {
    if (!ids || !ids.length) return;
    setSentNow((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(String(id))); return next; });
    if (libraryOwner.current) loadUsage();
    for (const id of ids) { try { window.dispatchEvent(new CustomEvent("shape:coach-progress-refresh", { detail: { clientId: id } })); } catch (e) {} }
  };
  // Who is on each card's plan, and the one most clients are on (a chip, not a bigger card).
  const entryOf = (t) => (usage.state === "ready" && t.id && Object.prototype.hasOwnProperty.call(usage.map, t.id) ? usage.map[t.id] : null);
  const most = usage.state === "ready" ? DashMeals.mostUsedPlan(usage.map, usage.capped, usage.untracked) : null;
  const untrackedNote = !preview && usage.state === "ready" && usage.untracked > 0 ? dmbUntrackedNote(usage.untracked) : null;
  const [notice, setNotice] = React.useState("");
  // Delete: the plans route's own DELETE (the app's coach Plans uses it), behind ShapeConfirm. A
  // plan sent to a client is a snapshot on their Eat page, and stays.
  const canDelete = signedIn && typeof window !== "undefined" && !!(window.ShapeConfirm && window.ShapeConfirm.open);
  const remove = async (t) => {
    const ok = await window.ShapeConfirm.open({ title: "Delete this meal plan?", name: t.name, confirmLabel: "Delete plan",
      message: "It leaves your library for good. A client you already sent it to keeps the plan they have." });
    if (!ok) return;
    setNotice("");
    try {
      const res = await fetch("/api/coach/plans", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || "Couldn’t delete that plan. Retry.");
      setTemplates((prev) => (prev || []).filter((x) => x.id !== t.id));
      setNotice(t.name + " is deleted.");
    } catch (e) { setNotice(e.message || "Couldn’t delete that plan. Retry."); }
  };

  return (
    <React.Fragment>
      {preview && <DashDemoBand />}
      <DashPage
        tourHero="hero-plans"
        navItems={nutriNavItems("plans")}
        payoutCard={nutriPayoutCard}
        eyebrow={(templates ? templates.length : 0) + " TEMPLATES · BY GOAL PHASE"}
        title="Plans"
        subtitle={view ? "The week on one screen. It saves as you build; Assign sends each client a scaled copy." : "Your meal-plan library and who needs a plan next. Assign pre-fills the plan queue."}
      >
        {targetClient && <p role="status">Choose a plan for {targetClient.profile.name}{/\.$/.test(targetClient.profile.name) ? "" : "."} The assignment will have this client selected.{pickFor && <> <button type="button" style={dmbBtn(false)} onClick={() => setPickFor(null)}>Not now</button></>}</p>}
        {view ? (
          <DmbBuilder
            key={view.template.id || view.template.name}
            template={view.template} ownerId={libraryOwner.current}
            clients={people} queue={peopleQueue} lifecycle={lifecycle} live={isLive}
            assignClientId={view.assignClientId} preselectId={targetClient ? forClient : null} emptyNote={emptyNote} onAssigned={assigned}
            customFoods={customFoods}
            who={view.template.id && !String(view.template.id).startsWith("demo-") ? <DmbWho entry={entryOf(view.template)} usage={usage} roster={roster} clients={people} preview={preview} /> : null}
            onBack={() => { setView(null); setRefresh((n) => n + 1); }}
            onSaved={({ id, name, doc, revision }) => {
              // The saved revision rides into the library's copy, so reopening it names the right one.
              setTemplates(prev => [{id,name,detail:{...view.template.detail,mealBuilder:doc,revision}},...(prev||[]).filter(t=>t.id!==id)]);
            }}
          />
        ) : (
          <React.Fragment>
            {/* Zone 1 — Library */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => setView({ template: newPlan("maintain") })} style={dmbBtn(true)}>+ New meal plan</button>
              <button onClick={() => setRefresh((n) => n + 1)} style={dmbBtn(false)}>Refresh</button>
            </div>
            {/* The week's job, the page's highest block (Lift 2). */}
            <DmbTodoLine model={todoModel} onAssignAll={assignAll} onReview={() => setReviewing(true)} />
            {walk && !assignFor && <p role="status" className="dash-lib-walk">
              Assign all · {walk.at} of {walk.rows.length} opened. Next: {walk.rows[walk.at].name} → {walk.rows[walk.at].suggestion.name}{" "}
              <button type="button" style={dmbBtn(true)} onClick={() => openWalk(walk.rows, walk.at)}>Open</button>{" "}
              <button type="button" style={dmbBtn(false)} onClick={() => setWalk(null)}>Stop</button>
            </p>}
            {notice && <p role="status" className="dash-lib-quiet">{notice}</p>}
            {error && <p role="alert" style={{ fontSize: 13.5, color: "var(--sh-ink, #f2ede4)" }}>{error} <button onClick={() => setRefresh((n) => n + 1)} style={dmbBtn(false)}>Retry</button></p>}
            {templates == null && !error && <p role="status" style={{ color: DMB_INK50, fontSize: 13 }}>Loading plans…</p>}
            {templates && templates.length === 0 && (
              <div>
                <p style={{ fontSize: 13.5, color: DMB_INK50 }}>No meal plans on the website yet. Build one to start your library.</p>
                {window.ShapeAskNoraLink && <window.ShapeAskNoraLink label="Ask Nora to draft one" draft="Draft a meal plan for me: " />}
              </div>
            )}
            {appOnly > 0 && <p style={{ fontFamily: DMB_MONO, fontSize: 9, lineHeight: 1.6, letterSpacing: "0.06em", color: DMB_INK50, margin: "0 0 14px" }}>
              {appOnly === 1 ? "1 meal plan you wrote in the app isn’t listed here" : appOnly + " meal plans you wrote in the app aren’t listed here"} — the website builder can’t open {appOnly === 1 ? "it" : "them"} yet. You’ll find {appOnly === 1 ? "it" : "them"} in the app.
            </p>}
            {!!(templates && templates.length) && <div className="dbu-library-filters">
              {/* ⚠ EVERY FILTER SAYS WHAT IT WOULD LEAVE. Options inside one filter widen it,
                  two filters narrow each other, and the count beside Clear is the result. */}
              <DashFilterBar facets={[phaseFacet, ...DashMeals.MEAL_FACETS]} primaryFacetKeys={["phase"]} run={run} state={filters} setState={setFilters} one="plan" many="plans"
                placeholder="Find a plan or a recipe…" searchLabel="Find a plan by its name or a recipe in it"
                extra={<DashLibSort value={sort} onChange={setSort} options={DMB_SORTS} />} />
            </div>}
            {!!(templates && templates.length) && !run.shown.length && <p role="status" style={{ fontSize: 13.5, color: DMB_INK50 }}>No plans match these filters. <button onClick={() => setFilters(DFB_EMPTY)} style={dmbBtn(false)}>Clear filters</button></p>}
            {untrackedNote && !!(templates && templates.length) && <p role="status" className="dash-lib-quiet" data-untracked="">{untrackedNote}</p>}
            {/* ⚠ ONE ACTION PER CARD: Assign. Edit and Use as template live in the ⋯, and a click
                on the card opens the builder. The cover is the plan's type in its colour, and the
                type in words. */}
            <div className="dash-lib-grid">
              {shown.map(({ t, info }) => {
                const b = t.detail.mealBuilder;
                const ph = DashMeals.GOAL_PHASES.find((g) => g.key === b.goalPhase) || { label: "No phase", c: DMB_INK50 };
                const variants = b.days.reduce((s, d) => s + Object.keys(d.variants || {}).length, 0);
                return (
                  <DashLibCard key={t.id || t.name} name={t.name} onOpen={() => setView({ template: t })} openTitle={"Open " + t.name + " in the builder"}
                    cover={{ color: ph.c, tone: dashLibKind(b.goalPhase), kind: ph.label, badges: most && t.id && most.id === t.id ? <span className="dash-lib-badge" data-most="">Most used · {dmbCount(most.clients, "client", "clients")}</span> : null }}
                    meta={b.days.length + "-day rotation · " + b.targets.kcal + " kcal · " + b.targets.p + " g protein" + (variants ? " · " + dmbCount(variants, "variant", "variants") : "")}
                    primary={<button type="button" onClick={() => { setWalk(null); setAssignFor({ template: t, clientId: targetClient ? forClient : null }); }} style={dmbBtn(true)}>Assign</button>}
                    menu={<DashLibMenu label={"More for " + t.name} items={[
                      { key: "edit", label: "Edit", onSelect: () => setView({ template: t }) },
                      { key: "copy", label: "Use as template", onSelect: () => setView({ template: coachTemplateCopy(t) }) },
                      canDelete && t.id && { key: "delete", label: "Delete", danger: true, onSelect: () => remove(t) },
                    ]} />}>
                    <p className="dash-lib-facts">{dmbCardFacts(info)}</p>
                    <DmbWho entry={entryOf(t)} usage={usage} roster={roster} clients={people} preview={preview} />
                  </DashLibCard>
                );
              })}
            </div>
          </React.Fragment>
        )}
      </DashPage>
      {reviewing && todoModel.todo && (
        <DmbTodoDrawer todo={todoModel.todo} hasPlans={!!(templates && templates.length)} onClose={() => setReviewing(false)}
          onNew={(r) => { setReviewing(false); setPickFor(r.id); setView({ template: newPlan(r.phase) }); }}
          onAssign={(r) => { setReviewing(false); setWalk(null); setAssignFor({ template: r.suggestion.template, clientId: r.id }); }}
          onPick={(id) => { setReviewing(false); setPickFor(id); }} />
      )}
      {assignFor && (
        <DmbAssignModal
          template={{ id: assignFor.template.id, name: assignFor.template.name }}
          doc={assignFor.template.detail.mealBuilder}
          groceryEdits={assignFor.template.detail.mealBuilder.groceryEdits || {}}
          clients={people} queue={peopleQueue} lifecycle={lifecycle} live={isLive}
          preselectId={assignFor.clientId || (targetClient ? forClient : null)} emptyNote={emptyNote} onAssigned={assigned}
          onClose={closeAssign} />
      )}
    </React.Fragment>
  );
}

Object.assign(window, { NutritionistPlansPage, DmbBuilder, DmbAssignModal, DmbClientPreview, DmbTotalsBar });
