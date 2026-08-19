// Public Recipes page — "Shape Kitchen". A browsable library of recipes created
// by the Shape network of nutritionists and dieticians. Filterable by
// creator type and diet category, plus a saved "My library" view (gated behind
// an account). Each card links to that recipe's own page at /recipes/<slug>.
// Reuses SHAPE_RECIPES / recipeSlug / saved-recipe helpers from recipes.jsx and
// Header/Footer + theme tokens from pageShell.jsx (both load first).

const DIET_META = {
  "Vegan":        { color: "#4fae5a" },
  "Vegetarian":   { color: "#7bc043" },
  "Plant-based":  { color: "#2ee0c4" },
  "Seafood":      { color: "#3b9ed6" },
  "Poultry":      { color: "#e0a84e" },
  "Meat":         { color: "#c0533b" },
};
// Filter groups come from recipes.jsx (window.RECIPE_DIETS / RECIPE_PROTEINS /
// RECIPE_FREE_FROM / RECIPE_GOALS); fall back to literals if not yet loaded.
const DIETS = (typeof RECIPE_DIETS !== "undefined" ? RECIPE_DIETS : ["Vegan", "Vegetarian", "Pescatarian", "Plant-based", "Mediterranean"]);
const PROTEINS = (typeof RECIPE_PROTEINS !== "undefined" ? RECIPE_PROTEINS : ["Seafood", "Poultry", "Meat"]);
const FREE_FROM = (typeof RECIPE_FREE_FROM !== "undefined" ? RECIPE_FREE_FROM : ["Gluten-free", "Dairy-free"]);
const GOALS = (typeof RECIPE_GOALS !== "undefined" ? RECIPE_GOALS : ["High-protein", "Low-carb"]);
const CREATORS = [
  { key: "Nutritionist", label: "Nutritionists" },
  { key: "Dietician",    label: "Dieticians" },
];

function dietColor(diet) {
  return (DIET_META[diet] && DIET_META[diet].color) || TEAL;
}

function FilterChip({ label, active, color, onClick, count }) {
  const accent = color || TEAL;
  return (
    <button onClick={onClick}
      style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em",
        textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
        padding: "8px 14px", borderRadius: 999,
        border: `1px solid ${active ? accent : "rgba(20,17,13,0.28)"}`,
        background: active ? accent : "rgba(255,255,255,0.35)",
        color: active ? "#0a0f0d" : "rgba(20,17,13,0.82)",
        display: "inline-flex", alignItems: "center", gap: 7, lineHeight: 1,
        transition: "all 120ms ease",
      }}>
      {label}
      {typeof count === "number" && (
        <span style={{ fontSize: 10, opacity: active ? 0.7 : 0.5 }}>{count}</span>
      )}
    </button>
  );
}

function RecipeCard({ recipe, saved, onToggleSave }) {
  const dc = dietColor(recipe.diet);
  return (
    <a href={`/recipes/${recipeSlug(recipe)}`}
      style={{
        textAlign: "left", cursor: "pointer", border: "1px solid rgba(242,237,228,0.1)",
        background: PAPER, color: INK, borderRadius: 14, overflow: "hidden",
        display: "flex", flexDirection: "column", fontFamily: sans, textDecoration: "none",
      }}>
      <div style={{ height: 150, background: recipe.hero, position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: 12 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "#0a0f0d", background: dc, padding: "4px 9px", borderRadius: 999, fontWeight: 600 }}>
          {(recipe.diet || "").toUpperCase()}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(255,255,255,0.9)", background: "rgba(0,0,0,0.4)", padding: "4px 9px", borderRadius: 999 }}>
          {recipe.time.toUpperCase()} · {recipe.kcal} KCAL
        </span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(recipe); }}
          aria-label={saved ? "Remove from library" : "Save to library"}
          title={saved ? "Saved — click to remove" : "Save to library"}
          style={{
            position: "absolute", bottom: 10, right: 10, width: 34, height: 34, borderRadius: 999,
            border: `1px solid ${saved ? TEAL : "rgba(255,255,255,0.5)"}`,
            background: saved ? TEAL : "rgba(0,0,0,0.4)",
            color: saved ? "#0a0f0d" : "#fff", cursor: "pointer", fontSize: 15, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{saved ? "♥" : "♡"}</button>
      </div>
      <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: TEAL_BRIGHT }}>
          {(() => {
            // A sourced recipe has no author; credit the source instead. Plain text,
            // never a link — the whole card is already an anchor.
            const a = typeof recipeAttribution === "function" ? recipeAttribution(recipe) : null;
            if (!a) return "RECIPE";
            return a.kind === "authored"
              ? `${(a.role || "RECIPE").toUpperCase()} · ${a.name.toUpperCase()}`
              : a.name.toUpperCase();
          })()}
        </div>
        <div style={{ fontFamily: serif, fontWeight: 500, fontSize: 23, letterSpacing: "-0.02em", lineHeight: 1.12 }}>{recipe.title}</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: "auto", paddingTop: 6 }}>
          <Macro label="P" value={recipe.macros.p} color="#0ac5a8" />
          <Macro label="C" value={recipe.macros.c} color="#f4b860" />
          <Macro label="F" value={recipe.macros.f} color="#e07856" />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {recipe.tags.slice(0, 3).map(t => (
            <span key={t} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 4, color: "rgba(242,237,228,0.65)", background: "rgba(242,237,228,0.06)", border: "1px solid rgba(242,237,228,0.1)" }}>{t.toUpperCase()}</span>
          ))}
        </div>
        {/* Allergen claim note, one line. This grid is what the FREE FROM filters
            return, so a restored "free from" claim must carry its caveat HERE too —
            not only on the detail page. Certification clause only; the brand
            examples are detail-page-only. Inert text: the whole card is an anchor,
            so nothing here may be interactive. 71 of 85 recipes carry no
            `allergenNotes` at all (undefined, not an empty array). */}
        {(recipe.allergenNotes || []).length > 0 && (
          <div
            title={recipe.allergenNotes.map((n) => n.certification).join(" · ")}
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.04em",
              lineHeight: 1.35, color: "#f4b860",
              display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>
            {recipe.allergenNotes.map((n) => n.certification).join(" · ")}
          </div>
        )}
      </div>
    </a>
  );
}

function RecipesPage() {
  const all = (typeof SHAPE_RECIPES !== "undefined" ? SHAPE_RECIPES : []);
  const [diet, setDiet] = React.useState("All");
  const [needs, setNeeds] = React.useState([]); // multi-select dietary needs
  const [view, setView] = React.useState("all"); // "all" | "saved"
  const [me, setMe] = React.useState(null); // null = loading, false = signed out, object = user
  const [savedSlugs, setSavedSlugs] = React.useState(() => new Set(typeof getSavedRecipeSlugs === "function" ? getSavedRecipeSlugs() : []));
  const [authNudge, setAuthNudge] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "same-origin" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setMe(d && d.user ? d.user : false); })
      .catch(() => { if (!cancelled) setMe(false); });
    return () => { cancelled = true; };
  }, []);

  const loggedIn = !!me;
  const toggleSave = (recipe) => {
    if (!loggedIn) { setAuthNudge(true); return; }
    const slug = recipeSlug(recipe);
    toggleSavedRecipe(slug);
    setSavedSlugs(new Set(getSavedRecipeSlugs()));
  };

  const toggleNeed = (n) => setNeeds(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const savedCount = all.filter(r => savedSlugs.has(recipeSlug(r))).length;
  const matchesDiet = (r) => (typeof recipeMatchesDiet === "function") ? recipeMatchesDiet(r, diet) : (diet === "All" || r.diet === diet);
  const dietCount = (d) => all.filter(r => (typeof recipeMatchesDiet === "function") ? recipeMatchesDiet(r, d) : r.diet === d).length;
  const filtered = all.filter(r =>
    matchesDiet(r) &&
    (needs.length === 0 || needs.every(n => recipeNeeds(r).includes(n))) &&
    (view !== "saved" || savedSlugs.has(recipeSlug(r)))
  );
  const countFor = (predicate) => all.filter(predicate).length;

  return (
    <div style={{ background: "#e9e2d4", color: "#14110d", fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "linear-gradient(rgba(244,239,230,0.3), rgba(244,239,230,0.34)), url('/newdesign/shape-kitchen-bg.png') center center / cover no-repeat", backgroundColor: "#e9e2d4" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Recipes" />

        {/* Hero — Shape Kitchen banner over the kitchen backdrop image */}
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px" }}>
          <div style={{
            position: "relative",
            padding: "clamp(52px, 9vw, 92px) 0 clamp(20px, 3vw, 28px)",
          }}>
            <h1 style={{ fontFamily: serif, fontWeight: 300, fontSize: "clamp(46px, 7.4vw, 92px)", letterSpacing: "-0.04em", lineHeight: 0.98, margin: 0, color: "#14110d" }}>
              Shape <span style={{ fontStyle: "italic", color: TEAL_BRIGHT }}>Kitchen.</span>
            </h1>
            <div style={{ fontFamily: serif, fontWeight: 300, fontSize: "clamp(20px, 3vw, 30px)", letterSpacing: "-0.025em", lineHeight: 1.15, marginTop: 16, color: "rgba(20,17,13,0.82)", maxWidth: 720 }}>
              Recipes from our nutritionists and dieticians, and from the public record.
            </div>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(20,17,13,0.72)", maxWidth: 620, marginTop: 16 }}>
              Most are built by a Shape professional; the rest come from public-domain
              collections like USDA MyPlate Kitchen, credited on the recipe. Every one is
              macro-balanced and easy to scale, with a step-by-step method and a pro tip.
              Tap any recipe for the full page.
            </p>
          </div>
        </div>

        {/* View toggle: all recipes vs your saved library */}
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px 6px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "rgba(20,17,13,0.6)", width: 96 }}>LIBRARY</span>
          <FilterChip label="All recipes" active={view === "all"} onClick={() => setView("all")} count={all.length} />
          <FilterChip label="♥ Saved" active={view === "saved"} onClick={() => { setView("saved"); if (!loggedIn) setAuthNudge(true); }} count={savedCount} />
        </div>

        {/* Filters — Diet · Protein (single-select) + Free From · Goals (multi) */}
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 24px 4px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "rgba(20,17,13,0.6)", width: 96 }}>DIET</span>
            <FilterChip label="All" active={diet === "All"} onClick={() => setDiet("All")} count={all.length} />
            {DIETS.map(d => (
              <FilterChip key={d} label={d} active={diet === d} color={dietColor(d)} onClick={() => setDiet(d)} count={dietCount(d)} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "rgba(20,17,13,0.6)", width: 96 }}>PROTEIN</span>
            {PROTEINS.map(d => (
              <FilterChip key={d} label={d} active={diet === d} color={dietColor(d)} onClick={() => setDiet(d)} count={dietCount(d)} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "rgba(20,17,13,0.6)", width: 96 }}>FREE FROM</span>
            {FREE_FROM.map(n => (
              <FilterChip key={n} label={n} active={needs.includes(n)} onClick={() => toggleNeed(n)} count={countFor(r => recipeNeeds(r).includes(n))} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "rgba(20,17,13,0.6)", width: 96 }}>GOALS</span>
            {GOALS.map(n => (
              <FilterChip key={n} label={n} active={needs.includes(n)} onClick={() => toggleNeed(n)} count={countFor(r => recipeNeeds(r).includes(n))} />
            ))}
          </div>
        </div>

        {/* Account nudge for saving */}
        {authNudge && !loggedIn && (
          <div style={{ maxWidth: 1180, margin: "16px auto 0", padding: "0 24px" }}>
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(46,224,196,0.08)", border: "1px solid rgba(46,224,196,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: "rgba(20,17,13,0.88)" }}>Create a free account to save recipes to your library.</span>
              <span style={{ display: "flex", gap: 10 }}>
                <a href="/signup" style={{ background: TEAL, color: "#0a0f0d", padding: "9px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Create account</a>
                <a href="/login" style={{ background: "transparent", color: "#14110d", border: "1px solid rgba(20,17,13,0.3)", padding: "9px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, textDecoration: "none" }}>Log in</a>
              </span>
            </div>
          </div>
        )}

        {/* Result count */}
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: "rgba(20,17,13,0.62)" }}>
            {filtered.length} {filtered.length === 1 ? "RECIPE" : "RECIPES"}
            {(diet !== "All" || needs.length > 0 || view === "saved") ? " · FILTERED" : ""}
          </div>
          {(diet !== "All" || needs.length > 0) && (
            <button onClick={() => { setDiet("All"); setNeeds([]); }}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: TEAL_BRIGHT, background: "transparent", border: 0, cursor: "pointer" }}>
              Clear filters ×
            </button>
          )}
        </div>

        {/* Grid */}
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 24px 80px" }}>
          {filtered.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {filtered.map((r, i) => (
                <RecipeCard key={`${r.title}-${i}`} recipe={r} saved={savedSlugs.has(recipeSlug(r))} onToggleSave={toggleSave} />
              ))}
            </div>
          ) : view === "saved" ? (
            <div style={{ padding: "60px 0", textAlign: "center" }}>
              <div style={{ fontFamily: serif, fontWeight: 300, fontSize: 30, letterSpacing: "-0.02em", marginBottom: 10 }}>Your recipe library is empty</div>
              <p style={{ color: "rgba(20,17,13,0.7)", fontSize: 15, marginBottom: 18 }}>
                {loggedIn ? "Tap the ♥ on any recipe to save it here." : "Create a free account, then tap the ♥ on any recipe to save it here."}
              </p>
              {!loggedIn && <a href="/signup" style={{ background: TEAL, color: "#0a0f0d", padding: "11px 22px", borderRadius: 999, fontFamily: sans, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Create account</a>}
            </div>
          ) : (
            <div style={{ padding: "60px 0", textAlign: "center", color: "rgba(20,17,13,0.65)", fontFamily: sans, fontSize: 15 }}>
              No recipes match those filters yet.
            </div>
          )}
        </div>

        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RecipesPage />);
