// Recipe of the Day primitives.
// Loaded by ClientDashboard.html (Today widget) and any other page that wants
// to surface a daily recipe. PAPER / INK / TEAL / TEAL_BRIGHT + sans/serif
// come from pageShell.jsx, which must be loaded first.

// One mock recipe per weekday. Index 0 = Sunday to match Date#getDay().
const RECIPES_BY_WEEKDAY = [
  {
    title: "One-pan chicken & rice",
    by: "Rae Lindqvist",
    time: "30 min", servings: 1, kcal: 640,
    macros: { p: 48, c: 72, f: 18 },
    tags: ["High protein", "Pantry", "30 min"],
    hero: "linear-gradient(135deg, #e8b06a 0%, #b46a3c 60%, #1a1612 100%)",
    note: "Sunday reset — easy to scale up for meal prep.",
    ingredients: ["6 oz chicken thigh", "3/4 cup jasmine rice", "1 cup low-sodium broth", "Garlic, paprika, salt", "Frozen peas, handful"],
    steps: ["Sear chicken 3 min/side in a small skillet.", "Add rice + broth + spices, bring to simmer.", "Cover, cook 18 min on low.", "Stir in peas, rest 5 min covered. Serve."],
  },
  {
    title: "Greek yogurt power bowl",
    by: "Rae Lindqvist",
    time: "5 min", servings: 1, kcal: 480,
    macros: { p: 38, c: 52, f: 12 },
    tags: ["High protein", "No-cook", "Breakfast"],
    hero: "linear-gradient(135deg, #f0e0c2 0%, #c9a26a 55%, #1a1612 100%)",
    note: "Monday breakfast — sets the protein bar early.",
    ingredients: ["1 cup 0% Greek yogurt", "1 scoop whey", "1/2 cup berries", "2 tbsp granola", "1 tbsp peanut butter", "Drizzle of honey"],
    steps: ["Whisk yogurt + whey until smooth.", "Top with berries, granola, peanut butter.", "Drizzle honey. Eat immediately."],
  },
  {
    title: "Tempo turkey lettuce cups",
    by: "Rae Lindqvist",
    time: "20 min", servings: 1, kcal: 520,
    macros: { p: 42, c: 38, f: 22 },
    tags: ["Low carb", "Quick", "GF"],
    hero: "linear-gradient(135deg, #a3c98c 0%, #5b8a4c 55%, #1a1612 100%)",
    note: "Tuesday — quick spin between sessions.",
    ingredients: ["6 oz lean ground turkey", "1 tbsp soy sauce + 1 tsp sesame oil", "Garlic + ginger, minced", "Butter lettuce leaves", "Carrot + cucumber, julienned", "Sriracha to taste"],
    steps: ["Cook turkey with garlic + ginger, 6 min.", "Stir in soy + sesame, simmer 1 min.", "Spoon into lettuce cups, top with veg + sriracha."],
  },
  {
    title: "Sheet-pan salmon, sweet potato & broccoli",
    by: "Rae Lindqvist",
    time: "35 min", servings: 1, kcal: 620,
    macros: { p: 44, c: 58, f: 22 },
    tags: ["High protein", "GF", "Sheet-pan"],
    hero: "linear-gradient(135deg, #e07856 0%, #f4b860 50%, #1a1612 100%)",
    note: "Wednesday dinner — pairs with tonight's lift.",
    ingredients: ["6 oz salmon fillet", "1 medium sweet potato, cubed", "2 cups broccoli florets", "2 tbsp olive oil", "1 tsp paprika, salt, pepper", "1 lemon, sliced"],
    steps: ["Preheat oven to 425°F (220°C).", "Toss sweet potato with 1 tbsp oil + paprika; roast 15 min.", "Add broccoli + salmon to the pan. Drizzle remaining oil, season, top with lemon.", "Roast 12–15 min until salmon flakes. Serve immediately."],
  },
  {
    title: "Steak & sweet potato hash",
    by: "Rae Lindqvist",
    time: "25 min", servings: 1, kcal: 660,
    macros: { p: 46, c: 56, f: 26 },
    tags: ["High protein", "Iron-rich"],
    hero: "linear-gradient(135deg, #8b3a28 0%, #c95a3c 55%, #1a1612 100%)",
    note: "Thursday — leg-day refuel.",
    ingredients: ["6 oz sirloin steak", "1 sweet potato, diced small", "1/2 onion, sliced", "1 bell pepper, diced", "1 tbsp olive oil", "Garlic powder, smoked paprika"],
    steps: ["Sauté sweet potato in oil, 8 min, covered.", "Add onion + pepper + spices, cook 5 min.", "Sear steak 3 min/side, rest 4 min, slice.", "Top hash with steak."],
  },
  {
    title: "Shrimp & quinoa harvest bowl",
    by: "Rae Lindqvist",
    time: "20 min", servings: 1, kcal: 560,
    macros: { p: 40, c: 62, f: 16 },
    tags: ["Pescatarian", "Meal prep", "GF"],
    hero: "linear-gradient(135deg, #f1a48f 0%, #e07856 55%, #1a1612 100%)",
    note: "Friday — light enough for an evening session.",
    ingredients: ["6 oz shrimp, peeled", "3/4 cup cooked quinoa", "1 cup roasted veg (zucchini, peppers)", "1 tbsp olive oil + lemon", "Feta crumbles", "Parsley"],
    steps: ["Sauté shrimp in oil + lemon, 4 min.", "Build bowl: quinoa, veg, shrimp.", "Top with feta + parsley."],
  },
  {
    title: "Black bean & sweet potato tacos",
    by: "Rae Lindqvist",
    time: "20 min", servings: 1, kcal: 540,
    macros: { p: 24, c: 78, f: 14 },
    tags: ["Vegetarian", "Fiber", "Quick"],
    hero: "linear-gradient(135deg, #d8a64a 0%, #8b5e30 60%, #1a1612 100%)",
    note: "Saturday — easy + carby for a rest day.",
    ingredients: ["1 cup black beans", "1 small sweet potato, cubed", "3 corn tortillas", "1/2 avocado", "Lime, cilantro, hot sauce", "1 tsp cumin"],
    steps: ["Roast sweet potato 18 min at 425°F.", "Warm beans with cumin, mash slightly.", "Char tortillas, build tacos.", "Top with avocado, lime, cilantro, hot sauce."],
  },
];

function recipeOfTheDay(date = new Date()) {
  return RECIPES_BY_WEEKDAY[date.getDay()];
}

function Macro({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)" }}>{label}</span>
      <span style={{ fontFamily: serif, fontSize: 18, color, lineHeight: 1 }}>{value}<span style={{ fontSize: 11, color: "rgba(242,237,228,0.4)", marginLeft: 1 }}>g</span></span>
    </div>
  );
}

// Modal with full recipe — ingredients + steps. Closed by clicking the
// backdrop, the × button, or pressing Escape.
function RecipeModal({ recipe, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.7)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: PAPER, color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "24px 28px", background: recipe.hero, position: "relative" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>
            RECIPE OF THE DAY · FROM {recipe.by.toUpperCase()}
          </div>
          <div style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1.1, maxWidth: "calc(100% - 36px)" }}>{recipe.title}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em", marginTop: 10 }}>
            {recipe.time.toUpperCase()} · SERVES {recipe.servings} · {recipe.kcal} KCAL
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.35)", border: 0, color: "#fff", width: 30, height: 30, borderRadius: 999, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "22px 28px", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 18, marginBottom: 18, flexWrap: "wrap" }}>
            <Macro label="P" value={recipe.macros.p} color="#1ec0a8" />
            <Macro label="C" value={recipe.macros.c} color="#f4b860" />
            <Macro label="F" value={recipe.macros.f} color="#e07856" />
          </div>
          {recipe.note && (
            <div style={{ fontSize: 13, color: "rgba(242,237,228,0.7)", marginBottom: 22, fontStyle: "italic" }}>
              "{recipe.note}" — {recipe.by}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 28 }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>INGREDIENTS</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", fontSize: 13, color: "rgba(242,237,228,0.85)", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: TEAL, marginTop: 8, flex: "none" }} />
                    <span>{ing}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>STEPS</div>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", counterReset: "step" }}>
                {recipe.steps.map((s, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, padding: "10px 0", fontSize: 13.5, color: "rgba(242,237,228,0.9)", lineHeight: 1.55, borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TEAL_BRIGHT, letterSpacing: "0.08em" }}>{String(i + 1).padStart(2, "0")}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 28px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <a href="ClientLibrary.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "9px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Save to library</a>
          <a href="ClientNutri.html" style={{ background: INK, color: PAPER, border: 0, padding: "9px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Add to today's plan</a>
        </div>
      </div>
    </div>
  );
}

// Compact card for the Today dashboard. Click "View recipe" to open the
// full modal. The fixed-by-weekday rotation keeps the mock self-consistent.
function RecipeOfTheDayWidget({ recipe }) {
  const r = recipe || recipeOfTheDay();
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr auto", gap: 20, alignItems: "center" }}>
      <div style={{ height: 140, borderRadius: 10, background: r.hero, display: "flex", alignItems: "flex-end", padding: 14 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.35)", padding: "4px 9px", borderRadius: 999 }}>
          {r.time.toUpperCase()} · {r.kcal} KCAL
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 6 }}>FROM {r.by.toUpperCase()}</div>
        <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 8 }}>{r.title}</div>
        <div style={{ fontSize: 13, color: "rgba(242,237,228,0.7)", marginBottom: 10, lineHeight: 1.5 }}>{r.note}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <Macro label="P" value={r.macros.p} color="#1ec0a8" />
          <Macro label="C" value={r.macros.c} color="#f4b860" />
          <Macro label="F" value={r.macros.f} color="#e07856" />
          <div style={{ display: "flex", gap: 6, marginLeft: 4 }}>
            {r.tags.map(t => (
              <span key={t} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 4, color: "rgba(242,237,228,0.7)", background: "rgba(242,237,228,0.06)", border: "1px solid rgba(242,237,228,0.1)" }}>{t.toUpperCase()}</span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={() => setOpen(true)}
          style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
          View recipe
        </button>
        <a href="ClientNutri.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", padding: "9px 22px", borderRadius: 999, fontFamily: sans, fontSize: 12.5, textDecoration: "none", textAlign: "center", whiteSpace: "nowrap" }}>
          See plan
        </a>
      </div>
      {open && <RecipeModal recipe={r} onClose={() => setOpen(false)} />}
    </div>
  );
}

if (typeof window !== "undefined") {
  window.recipeOfTheDay = recipeOfTheDay;
  window.RecipeOfTheDayWidget = RecipeOfTheDayWidget;
  window.RecipeModal = RecipeModal;
}
