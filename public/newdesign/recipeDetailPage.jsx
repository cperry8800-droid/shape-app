// Per-recipe page rendered at /recipes/<slug> (a Next rewrite serves this file;
// the slug is read from the path). Reuses SHAPE_RECIPES / findRecipeBySlug /
// recipeSlug / Macro from recipes.jsx and Header/Footer + theme tokens from
// pageShell.jsx (both load first).

const RD_DIET_COLOR = {
  "Vegan": "#4fae5a", "Vegetarian": "#7bc043", "Plant-based": "#2ee0c4",
  "Seafood": "#3b9ed6", "Poultry": "#e0a84e", "Meat": "#c0533b",
};

function rdGetSlug() {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("r");
    if (q) return q;
    const parts = window.location.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (last && last !== "RecipeDetail.html" && last.toLowerCase() !== "recipes") return last;
  } catch (e) {}
  return "";
}

// Split an ingredient string like "3/4 cup jasmine rice" into { qty, item }.
function rdParseIngredient(s) {
  s = String(s || "").trim();
  const m = s.match(/^([0-9¼½¾⅓⅔.\/]+(?:\s*[-–]\s*[0-9.\/]+)?\s*(?:oz|ounces?|cups?|tbsp|tablespoons?|tsp|teaspoons?|lb|lbs|pounds?|kg|g|grams?|ml|l|liters?|cans?|cloves?|slices?|pints?|sprigs?|scoops?|handfuls?|bags?|btl|bottles?)?\.?)\s+(.+)$/i);
  if (m && m[2]) return { qty: m[1].trim(), item: m[2].trim() };
  return { qty: "", item: s };
}

// Itemize a recipe's ingredients into the shared grocery store
// (shape.grocery.lists.v1) that ClientGrocery.html reads, and make it the
// active list so the grocery page opens straight to it (with Send to Instacart).
function rdAddRecipeToGrocery(recipe) {
  const STORE_KEY = "shape.grocery.lists.v1";
  const ACTIVE_KEY = "shape.grocery.activeListId.v1";
  let lists = [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) lists = parsed;
  } catch (e) {}
  const id = "recipe-" + recipeSlug(recipe);
  const items = (recipe.ingredients || []).map((ing, idx) => {
    const parts = rdParseIngredient(ing);
    return { id: `${id}-${idx}`, item: parts.item, qty: parts.qty, category: "other", checked: false };
  });
  const list = { id, name: `${recipe.title} — ingredients`, items };
  const i = lists.findIndex(l => l.id === id);
  if (i >= 0) lists[i] = list; else lists = [list, ...lists];
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(lists));
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch (e) {}
  return items.length;
}

// Add a recipe to "today's plan" — written to the shared store that
// ClientNutri.html reads, so it shows up under Today's meals.
const RD_PLAN_KEY = "shape.todaysPlan.v1";
function rdTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function rdAddRecipeToPlan(recipe) {
  let store = {};
  try { const raw = window.localStorage.getItem(RD_PLAN_KEY); const p = raw ? JSON.parse(raw) : null; if (p && typeof p === "object") store = p; } catch (e) {}
  const dayKey = rdTodayKey();
  const day = Array.isArray(store[dayKey]) ? store[dayKey] : [];
  const id = "recipe-" + recipeSlug(recipe);
  const m = recipe.macros || {};
  const entry = { id, name: recipe.title, time: "", kcal: recipe.kcal || 0, protein: m.p || 0, carbs: m.c || 0, fat: m.f || 0, planned: true, source: "Shape Kitchen", addedAt: Date.now() };
  const i = day.findIndex((x) => x.id === id);
  if (i >= 0) day[i] = entry; else day.push(entry);
  store[dayKey] = day;
  try { window.localStorage.setItem(RD_PLAN_KEY, JSON.stringify(store)); } catch (e) {}
  return day.length;
}

function RDRelatedCard({ recipe }) {
  const dc = RD_DIET_COLOR[recipe.diet] || TEAL;
  return (
    <a href={`/recipes/${recipeSlug(recipe)}`}
      style={{ border: "1px solid rgba(242,237,228,0.1)", background: PAPER, color: INK, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", textDecoration: "none", fontFamily: sans }}>
      <div style={{ height: 96, background: recipe.hero, display: "flex", alignItems: "flex-start", padding: 10 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#0a0f0d", background: dc, padding: "3px 8px", borderRadius: 999, fontWeight: 600 }}>{(recipe.diet || "").toUpperCase()}</span>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: TEAL_BRIGHT, marginBottom: 6 }}>{(recipe.byRole || "").toUpperCase()}</div>
        <div style={{ fontFamily: serif, fontWeight: 500, fontSize: 17, letterSpacing: "-0.01em", lineHeight: 1.15 }}>{recipe.title}</div>
      </div>
    </a>
  );
}

function RecipeDetailPage() {
  const slug = rdGetSlug();
  const recipe = (typeof findRecipeBySlug === "function") ? findRecipeBySlug(slug) : null;

  if (!recipe) {
    return (
      <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh" }}>
        <Header active="Recipes" />
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: serif, fontWeight: 300, fontSize: 40, letterSpacing: "-0.03em", marginBottom: 12 }}>Recipe not found</div>
          <p style={{ color: "rgba(242,237,228,0.7)", fontSize: 16, marginBottom: 24 }}>We couldn't find that recipe. It may have been renamed or removed.</p>
          <a href="/recipes" style={{ background: TEAL, color: "#0a0f0d", padding: "11px 22px", borderRadius: 999, fontFamily: sans, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>← Back to Shape Kitchen</a>
        </div>
        <Footer />
      </div>
    );
  }

  const dc = RD_DIET_COLOR[recipe.diet] || TEAL;
  const related = (typeof SHAPE_RECIPES !== "undefined" ? SHAPE_RECIPES : [])
    .filter(r => r !== recipe && (r.diet === recipe.diet || r.byRole === recipe.byRole))
    .slice(0, 3);

  const [added, setAdded] = React.useState(0); // count of items added (0 = not yet)
  const addToGrocery = () => { setAdded(rdAddRecipeToGrocery(recipe)); };
  const [planAdded, setPlanAdded] = React.useState(false);
  const addToPlan = () => {
    setPlanAdded(true);
    const m = recipe.macros || {};
    const body = { name: recipe.title, kcal: recipe.kcal || 0, protein: m.p || 0, carbs: m.c || 0, fat: m.f || 0, source: "Shape Kitchen", mealRef: "recipe-" + recipeSlug(recipe) };
    // Signed in → sync to the account (shows on web + mobile); else localStorage.
    if (me) {
      fetch("/api/client/planned-meals", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then((r) => { if (!r.ok) rdAddRecipeToPlan(recipe); })
        .catch(() => rdAddRecipeToPlan(recipe));
    } else {
      rdAddRecipeToPlan(recipe);
    }
  };

  // Save-to-library (gated behind an account).
  const rslug = recipeSlug(recipe);
  const [me, setMe] = React.useState(null); // null=loading, false=signed out, obj=user
  const [saved, setSaved] = React.useState(() => (typeof isRecipeSaved === "function") ? isRecipeSaved(rslug) : false);
  const [authNudge, setAuthNudge] = React.useState(false);
  React.useEffect(() => {
    let c = false;
    fetch("/api/me", { credentials: "same-origin" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!c) setMe(d && d.user ? d.user : false); })
      .catch(() => { if (!c) setMe(false); });
    return () => { c = true; };
  }, []);
  const toggleSave = () => {
    if (!me) { setAuthNudge(true); return; }
    setSaved(toggleSavedRecipe(rslug));
  };

  // Reviews — live from /api/recipes/reviews (Supabase-backed, shared across users)
  const [reviews, setReviews] = React.useState([]);
  const [formRating, setFormRating] = React.useState(0);
  const [hoverRating, setHoverRating] = React.useState(0);
  const [reviewText, setReviewText] = React.useState("");
  const [posting, setPosting] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/recipes/reviews?slug=${encodeURIComponent(rslug)}`, { credentials: "same-origin" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d && Array.isArray(d.reviews)) setReviews(d.reviews); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [rslug]);
  const summary = (reviews.length)
    ? { avg: Math.round((reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length) * 10) / 10, count: reviews.length }
    : { avg: 0, count: 0 };
  const submitReview = () => {
    if (!me) { setAuthNudge(true); return; }
    if (!formRating || posting) return;
    setPosting(true);
    fetch("/api/recipes/reviews", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: rslug, rating: formRating, text: reviewText }),
    })
      .then(r => (r.ok ? r.json() : r.json().then(e => Promise.reject(e))))
      .then(d => { if (d && d.review) { setReviews(prev => [d.review, ...prev]); setFormRating(0); setHoverRating(0); setReviewText(""); } })
      .catch(err => { if (err && /sign in/i.test(err.error || "")) setAuthNudge(true); })
      .finally(() => setPosting(false));
  };
  const Stars = ({ value, size = 14 }) => (
    <span style={{ color: "#f4b860", fontSize: size, letterSpacing: 1 }} aria-label={`${value} out of 5`}>
      {"★★★★★".slice(0, Math.round(value))}<span style={{ color: "rgba(242,237,228,0.25)" }}>{"★★★★★".slice(0, 5 - Math.round(value))}</span>
    </span>
  );

  return (
    <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 0%, rgba(26,24,19,0.5) 0%, rgba(11,14,12,0.85) 60%, #0b0e0c 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Recipes" />

        <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px 0" }}>
          <a href="/recipes" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.6)", textDecoration: "none" }}>← Shape Kitchen</a>
        </div>

        {/* Hero banner */}
        <div style={{ maxWidth: 980, margin: "16px auto 0", padding: "0 24px" }}>
          <div style={{ borderRadius: 16, overflow: "hidden", background: recipe.hero, padding: "40px 32px", position: "relative" }}>
            <div style={{ display: "inline-block", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "#0a0f0d", background: dc, padding: "4px 10px", borderRadius: 999, fontWeight: 600, marginBottom: 14 }}>
              {(recipe.diet || "").toUpperCase()}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
              {(() => {
                const a = typeof recipeAttribution === "function" ? recipeAttribution(recipe) : null;
                if (!a) return "RECIPE";
                if (a.kind === "authored") return `${(a.role || "RECIPE").toUpperCase()} · ${a.name.toUpperCase()}`;
                // Public domain: credit the source, and make the licence reachable.
                return a.url
                  ? <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>{a.name.toUpperCase()}</a>
                  : a.name.toUpperCase();
              })()}
            </div>
            <h1 style={{ fontFamily: serif, fontWeight: 300, fontSize: "clamp(34px, 5vw, 56px)", letterSpacing: "-0.04em", lineHeight: 1.0, color: "#fff", margin: 0, maxWidth: 760 }}>{recipe.title}</h1>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "rgba(255,255,255,0.82)", letterSpacing: "0.06em", marginTop: 16 }}>
              {recipe.time.toUpperCase()} · SERVES {recipe.servings} · {recipe.kcal} KCAL
            </div>
          </div>
        </div>

        {/* Macros + tags */}
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 24px 0", display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
          <Macro label="PROTEIN" value={recipe.macros.p} color="#0ac5a8" />
          <Macro label="CARBS" value={recipe.macros.c} color="#f4b860" />
          <Macro label="FAT" value={recipe.macros.f} color="#e07856" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
            {recipe.tags.map(tg => (
              <span key={tg} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.08em", padding: "4px 9px", borderRadius: 4, color: "rgba(242,237,228,0.7)", background: "rgba(242,237,228,0.06)", border: "1px solid rgba(242,237,228,0.1)" }}>{tg.toUpperCase()}</span>
            ))}
          </div>
        </div>

        {recipe.note && (
          <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 24px 0" }}>
            <div style={{ fontSize: 15, color: "rgba(242,237,228,0.75)", fontStyle: "italic", lineHeight: 1.5 }}>
              {(() => {
                const a = typeof recipeAttribution === "function" ? recipeAttribution(recipe) : null;
                if (!a) return `"${recipe.note}"`;
                return a.kind === "authored"
                  ? `"${recipe.note}" — ${a.name}${a.role ? `, ${a.role}` : ""}`
                  : `"${recipe.note}" — ${a.name}`;
              })()}
            </div>
          </div>
        )}

        {/* Ingredients + Method */}
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px 0" }}>
          <div className="rd-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 36 }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.16em", color: TEAL_BRIGHT, marginBottom: 12 }}>INGREDIENTS</div>
              {/* Allergen claim note — a recipe that KEEPS a "free from" claim over an
                  ambiguous ingredient names the safe form to buy. Reads BEFORE the
                  ingredient list, so the caveat lands before the shopping does.
                  71 of 85 recipes carry no `allergenNotes` at all (the field is
                  undefined, not an empty array), so this must never assume presence.
                  Its own unattributed block — never the tip/byline machinery. */}
              {(recipe.allergenNotes || []).map((n, i) => (
                <div key={i} style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(244,184,96,0.08)", border: "1px solid rgba(244,184,96,0.28)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: "#f4b860", marginBottom: 6 }}>
                    {"ALLERGEN · " + String(n.allergen || "").toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13.5, color: "rgba(242,237,228,0.88)", lineHeight: 1.5 }}>
                    {typeof recipeAllergenNoteText === "function" ? recipeAllergenNoteText(n) : n.certification}
                  </div>
                </div>
              ))}
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", fontSize: 14.5, color: "rgba(242,237,228,0.88)", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.07)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: TEAL, marginTop: 8, flex: "none" }} />
                    <span>{ing}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.16em", color: TEAL_BRIGHT, marginBottom: 12 }}>METHOD</div>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                {recipe.steps.map((s, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 14, padding: "14px 0", fontSize: 15, color: "rgba(242,237,228,0.92)", lineHeight: 1.6, borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.07)" }}>
                    <span style={{ fontFamily: serif, fontSize: 22, color: TEAL_BRIGHT, lineHeight: 1 }}>{String(i + 1).padStart(2, "0")}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {recipe.tip && (
          <div style={{ maxWidth: 980, margin: "28px auto 0", padding: "0 24px" }}>
            <div style={{ padding: "18px 20px", borderRadius: 12, background: "rgba(46,224,196,0.08)", border: "1px solid rgba(46,224,196,0.25)" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.16em", color: TEAL_BRIGHT, marginBottom: 8 }}>PRO TIP</div>
              <div style={{ fontSize: 15, color: "rgba(242,237,228,0.9)", lineHeight: 1.55 }}>{recipe.tip}</div>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div style={{ maxWidth: 980, margin: "28px auto 0", padding: "0 24px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {added > 0 ? (
            <>
              <a href="ClientGrocery.html" style={{ background: TEAL, color: "#0a0f0d", border: 0, padding: "11px 24px", borderRadius: 999, fontFamily: sans, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                Open grocery list →
              </a>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em", color: TEAL_BRIGHT }}>
                ✓ ADDED {added} {added === 1 ? "ITEM" : "ITEMS"}
              </span>
            </>
          ) : (
            <button onClick={addToGrocery} style={{ background: TEAL, color: "#0a0f0d", border: 0, padding: "11px 24px", borderRadius: 999, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Add to grocery list
            </button>
          )}
          <button onClick={toggleSave} style={{
            background: saved ? "rgba(46,224,196,0.12)" : "transparent",
            color: saved ? TEAL_BRIGHT : INK,
            border: `1px solid ${saved ? "rgba(46,224,196,0.5)" : "rgba(242,237,228,0.25)"}`,
            padding: "11px 22px", borderRadius: 999, fontFamily: sans, fontSize: 14, cursor: "pointer",
          }}>{saved ? "✓ Saved to library" : "♥ Save to library"}</button>
          {planAdded ? (
            <a href="ClientNutri.html" style={{ background: "rgba(46,224,196,0.12)", color: TEAL_BRIGHT, border: "1px solid rgba(46,224,196,0.5)", padding: "11px 22px", borderRadius: 999, fontFamily: sans, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>✓ Added · Open plan →</a>
          ) : (
            <button onClick={addToPlan} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "11px 22px", borderRadius: 999, fontFamily: sans, fontSize: 14, cursor: "pointer" }}>Add to today's plan</button>
          )}
        </div>
        {authNudge && !me && (
          <div style={{ maxWidth: 980, margin: "12px auto 0", padding: "0 24px" }}>
            <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(46,224,196,0.08)", border: "1px solid rgba(46,224,196,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, color: "rgba(242,237,228,0.9)" }}>Create a free account to save recipes to your library.</span>
              <span style={{ display: "flex", gap: 10 }}>
                <a href="/signup" style={{ background: TEAL, color: "#0a0f0d", padding: "8px 16px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Create account</a>
                <a href="/login" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "8px 16px", borderRadius: 999, fontFamily: sans, fontSize: 13, textDecoration: "none" }}>Log in</a>
              </span>
            </div>
          </div>
        )}
        <div style={{ maxWidth: 980, margin: "10px auto 0", padding: "0 24px" }}>
          <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.55)", lineHeight: 1.5 }}>
            Adds all {(recipe.ingredients || []).length} ingredients to your grocery list, where you can check them off or send the whole list to Instacart.
          </div>
        </div>

        {/* Reviews */}
        <div style={{ maxWidth: 980, margin: "48px auto 0", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", borderTop: "1px solid rgba(242,237,228,0.1)", paddingTop: 28 }}>
            <div style={{ fontFamily: serif, fontWeight: 300, fontSize: "clamp(26px, 4vw, 38px)", letterSpacing: "-0.03em" }}>Reviews</div>
            {summary.count > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Stars value={summary.avg} size={16} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "rgba(242,237,228,0.6)" }}>{summary.avg} · {summary.count} {summary.count === 1 ? "review" : "reviews"}</span>
              </div>
            ) : (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>Be the first to review</span>
            )}
          </div>

          {/* Write a review */}
          <div style={{ marginTop: 18, padding: "16px 18px", borderRadius: 12, background: PAPER, border: "1px solid rgba(242,237,228,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase" }}>Your rating</span>
              <span>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setFormRating(n)} onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    style={{ background: "transparent", border: 0, cursor: "pointer", padding: "0 2px", fontSize: 22, lineHeight: 1, color: (hoverRating || formRating) >= n ? "#f4b860" : "rgba(242,237,228,0.25)" }}>★</button>
                ))}
              </span>
            </div>
            <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Share how it turned out, any tweaks you made…" rows={3}
              style={{ width: "100%", boxSizing: "border-box", background: INK_DEEP, color: INK, border: "1px solid rgba(242,237,228,0.18)", borderRadius: 8, padding: "10px 12px", fontFamily: sans, fontSize: 14, resize: "vertical", outline: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button onClick={submitReview} disabled={!formRating || posting}
                style={{ background: formRating ? TEAL : "rgba(242,237,228,0.12)", color: formRating ? "#0a0f0d" : "rgba(242,237,228,0.4)", border: 0, padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13.5, fontWeight: 600, cursor: (formRating && !posting) ? "pointer" : "default" }}>
                {posting ? "Posting…" : "Post review"}
              </button>
            </div>
          </div>

          {/* Existing reviews */}
          {reviews.length > 0 && (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              {reviews.map(rv => (
                <div key={rv.id} style={{ padding: "14px 16px", borderRadius: 12, background: PAPER, border: "1px solid rgba(242,237,228,0.08)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                    <Stars value={rv.rating} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)" }}>
                      {rv.author.toUpperCase()} · {new Date(rv.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {rv.text && <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(242,237,228,0.85)" }}>{rv.text}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div style={{ maxWidth: 980, margin: "48px auto 0", padding: "0 24px" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.16em", color: "rgba(242,237,228,0.5)", marginBottom: 16 }}>MORE LIKE THIS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {related.map((r, i) => <RDRelatedCard key={`${r.title}-${i}`} recipe={r} />)}
            </div>
          </div>
        )}

        <div style={{ height: 64 }} />
        <Footer />
      </div>

      <style>{`@media (max-width: 760px){ .rd-cols { grid-template-columns: 1fr !important; gap: 28px !important; } }`}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RecipeDetailPage />);
