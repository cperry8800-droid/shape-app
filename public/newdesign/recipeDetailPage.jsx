// Per-recipe page rendered at /recipes/<slug> (a Next rewrite serves this file;
// the slug is read from the path). Reuses SHAPE_RECIPES / findRecipeBySlug /
// recipeSlug / recipeAttribution / recipeAllergenNoteText from recipes.jsx and
// Header/Footer from pageShell.jsx (both load first).
//
// Dressed to match the Menu (recipesPage.jsx, the owner's 2026-09-15 pick): the
// same bone paper, green ink and terracotta, the same three families, and no
// picture — the recipe's `hero` gradient is catalog data the parity test still
// compares, but a tinted banner with nothing in it is not a photograph, so the
// title carries the page instead. Every byline goes through recipeAttribution.
//
// ⚠ The token names are this file's own (RD_*) rather than the list page's
// (KM_*): tests/recipe-render.test.mjs evaluates both scripts in ONE scope, so a
// shared `const` name would be a SyntaxError there before either page renders.

const RD_PAPER = "#f4eee2";
const RD_PAPER2 = "#faf6ee";
const RD_INK = "#1e2a26";
const RD_INK2 = "rgba(30,42,38,0.72)";
const RD_INK3 = "rgba(30,42,38,0.5)";
const RD_LINE = "rgba(30,42,38,0.14)";
const RD_LINE2 = "rgba(30,42,38,0.07)";
const RD_TEAL = "#0a8f87";
const RD_TEAL_SOFT = "rgba(10,143,135,0.1)";
const RD_ACC = "#b7442b";
const RD_AMBER = "#8a5a17";
const RD_AMBER_SOFT = "rgba(224,168,78,0.16)";
const rdDisp = "'Anybody', 'Anybody Fallback', system-ui, sans-serif";
const rdNum = "'Doto', 'Doto Fallback', ui-monospace, monospace";
const rdSans = "'Schibsted Grotesk', 'Schibsted Fallback', 'Space Grotesk', system-ui, sans-serif";
// Colour as a signal beside the word, never the word (see recipesPage.jsx).
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

// The credit, in the two honest forms: a person with their role, or the source.
function rdCredit(recipe) {
  const a = typeof recipeAttribution === "function" ? recipeAttribution(recipe) : null;
  if (!a) return null;
  if (a.kind === "authored") return <>{a.role ? <><b>{a.role}</b> · </> : null}{a.name}</>;
  // Public domain: credit the source, and make the licence reachable.
  return <>From {a.url
    ? <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{a.name}</a>
    : a.name}</>;
}

function RDReading({ label, value }) {
  return <span className="rd-rd"><i>{label}</i>{value}</span>;
}

// A related recipe, as one line of the menu.
function RDRelatedRow({ recipe }) {
  const dc = RD_DIET_COLOR[recipe.diet] || RD_TEAL;
  return (
    <div className="rd-row">
      <div className="rd-row-main">
        <div className="rd-row-t">
          <a href={`/recipes/${recipeSlug(recipe)}`}>{recipe.title}</a>
          {recipe.diet ? <span className="rd-tag"><i aria-hidden style={{ background: dc }} />{recipe.diet}</span> : null}
        </div>
        <div className="rd-row-by">{rdCredit(recipe)}</div>
      </div>
      <div className="rd-row-r">
        <RDReading label="Time" value={recipe.time} />
        <RDReading label="Kcal" value={recipe.kcal} />
      </div>
    </div>
  );
}

function RecipeDetailPage() {
  const slug = rdGetSlug();
  const recipe = (typeof findRecipeBySlug === "function") ? findRecipeBySlug(slug) : null;

  if (!recipe) {
    return (
      <div className="rd" style={{ background: RD_PAPER, color: RD_INK, fontFamily: rdSans, minHeight: "100vh" }}>
        <Header active="Kitchen" />
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: rdDisp, fontWeight: 500, fontVariationSettings: "'wdth' 104", fontSize: 40, letterSpacing: "-0.02em", marginBottom: 12 }}>Recipe not found</div>
          <p style={{ color: RD_INK2, fontSize: 16, marginBottom: 24 }}>We couldn't find that recipe. It may have been renamed or removed.</p>
          <a href="/recipes" className="rd-btn p">← Back to Shape Kitchen</a>
        </div>
        <Footer />
        <style>{`.rd .rd-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:6px;font:inherit;font-weight:600;font-size:14px;border:1px solid ${RD_TEAL};color:${RD_TEAL};background:transparent;text-decoration:none;white-space:nowrap;cursor:pointer}.rd .rd-btn.p{background:${RD_TEAL};color:#fff}`}</style>
      </div>
    );
  }

  const dc = RD_DIET_COLOR[recipe.diet] || RD_TEAL;
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
    <span style={{ color: RD_ACC, fontSize: size, letterSpacing: 1 }} aria-label={`${value} out of 5`}>
      {"★★★★★".slice(0, Math.round(value))}<span style={{ color: RD_LINE }}>{"★★★★★".slice(0, 5 - Math.round(value))}</span>
    </span>
  );
  const noteCredit = (() => {
    const a = typeof recipeAttribution === "function" ? recipeAttribution(recipe) : null;
    if (!a) return "";
    return a.kind === "authored" ? ` — ${a.name}${a.role ? `, ${a.role}` : ""}` : ` — ${a.name}`;
  })();

  return (
    <div className="rd" style={{ background: RD_PAPER, color: RD_INK, fontFamily: rdSans, minHeight: "100vh" }}>
      <Header active="Kitchen" />

      <div className="rd-wrap">
        <a href="/recipes" className="rd-back">← Shape Kitchen</a>

        {/* Typographic hero — the title carries the page; no picture, because
            there is none, and a gradient with nothing in it is not one. */}
        <header className="rd-hero">
          <div className="rd-hero-top">
            {recipe.diet ? <span className="rd-tag"><i aria-hidden style={{ background: dc }} />{recipe.diet}</span> : null}
            <span className="rd-credit">{rdCredit(recipe)}</span>
          </div>
          <h1 className="rd-h1">{recipe.title}</h1>
          <div className="rd-readings">
            <RDReading label="Time" value={recipe.time} />
            <RDReading label="Serves" value={recipe.servings} />
            <RDReading label="Kcal" value={recipe.kcal} />
            <RDReading label="Protein" value={`${recipe.macros.p} g`} />
            <RDReading label="Carbs" value={`${recipe.macros.c} g`} />
            <RDReading label="Fat" value={`${recipe.macros.f} g`} />
          </div>
          {(recipe.tags || []).length ? (
            <div className="rd-tags">{recipe.tags.map(tg => <span key={tg}>{tg}</span>)}</div>
          ) : null}
        </header>

        {recipe.note && (
          <blockquote className="rd-note">
            {`“${recipe.note}”`}{noteCredit ? <span className="rd-note-by">{noteCredit}</span> : null}
          </blockquote>
        )}

        {/* Ingredients + Method */}
        <div className="rd-cols">
          <div>
            <div className="rd-eyebrow">Ingredients</div>
            {/* Allergen claim note — a recipe that KEEPS a "free from" claim over an
                ambiguous ingredient names the safe form to buy. Reads BEFORE the
                ingredient list, so the caveat lands before the shopping does.
                Most recipes carry no `allergenNotes` at all (the field is
                undefined, not an empty array), so this must never assume presence.
                Its own unattributed block — never the tip/byline machinery. */}
            {(recipe.allergenNotes || []).map((n, i) => (
              <div key={i} className="rd-allergen">
                <div className="rd-allergen-h">{"ALLERGEN · " + String(n.allergen || "").toUpperCase()}</div>
                <div className="rd-allergen-b">{typeof recipeAllergenNoteText === "function" ? recipeAllergenNoteText(n) : n.certification}</div>
              </div>
            ))}
            <ul className="rd-ings">
              {recipe.ingredients.map((ing, i) => <li key={i}><i aria-hidden />{ing}</li>)}
            </ul>
          </div>
          <div>
            <div className="rd-eyebrow">Method</div>
            <ol className="rd-steps">
              {recipe.steps.map((s, i) => (
                <li key={i}><b>{String(i + 1).padStart(2, "0")}</b><span>{s}</span></li>
              ))}
            </ol>
          </div>
        </div>

        {recipe.tip && (
          <div className="rd-tip">
            <div className="rd-eyebrow">Pro tip</div>
            <div className="rd-tip-b">{recipe.tip}</div>
          </div>
        )}

        {/* CTAs */}
        <div className="rd-ctas">
          {added > 0 ? (
            <>
              <a href="ClientGrocery.html" className="rd-btn p">Open grocery list →</a>
              <span className="rd-added">✓ Added {added} {added === 1 ? "item" : "items"}</span>
            </>
          ) : (
            <button type="button" onClick={addToGrocery} className="rd-btn p">Add to grocery list</button>
          )}
          <button type="button" onClick={toggleSave} className={`rd-btn${saved ? " on" : ""}`} aria-pressed={saved}>
            {saved ? "✓ Saved to library" : "♡ Save to library"}
          </button>
          {planAdded ? (
            <a href={dashShellHref("ClientNutri.html")} className="rd-btn on">✓ Added · Open plan →</a>
          ) : (
            <button type="button" onClick={addToPlan} className="rd-btn">Add to today's plan</button>
          )}
        </div>
        {authNudge && !me && (
          <div className="rd-nudge">
            <span>Create a free account to save recipes to your library.</span>
            <span className="rd-nudge-b">
              <a href="/signup" className="rd-btn p">Create account</a>
              <a href="/login" className="rd-btn">Log in</a>
            </span>
          </div>
        )}
        <div className="rd-fine">
          Adds all {(recipe.ingredients || []).length} ingredients to your grocery list, where you can check them off or send the whole list to Instacart.
        </div>

        {/* Reviews */}
        <section className="rd-reviews" aria-labelledby="rd-reviews-h">
          <div className="rd-reviews-h">
            <h2 id="rd-reviews-h">Reviews</h2>
            {summary.count > 0 ? (
              <div className="rd-reviews-s">
                <Stars value={summary.avg} size={16} />
                <span>{summary.avg} · {summary.count} {summary.count === 1 ? "review" : "reviews"}</span>
              </div>
            ) : (
              <span className="rd-reviews-first">Be the first to review</span>
            )}
          </div>

          {/* Write a review */}
          <div className="rd-review-form">
            <div className="rd-review-rate">
              <span className="rd-eyebrow q">Your rating</span>
              <span>
                {[1, 2, 3, 4, 5].map(n => (
                  <button type="button" key={n} onClick={() => setFormRating(n)} onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    style={{ background: "transparent", border: 0, cursor: "pointer", padding: "0 2px", fontSize: 22, lineHeight: 1, color: (hoverRating || formRating) >= n ? RD_ACC : RD_LINE }}>★</button>
                ))}
              </span>
            </div>
            <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Share how it turned out, any tweaks you made…" rows={3} />
            <div className="rd-review-post">
              <button type="button" onClick={submitReview} disabled={!formRating || posting} className="rd-btn p">
                {posting ? "Posting…" : "Post review"}
              </button>
            </div>
          </div>

          {/* Existing reviews */}
          {reviews.length > 0 && (
            <div className="rd-review-list">
              {reviews.map(rv => (
                <div key={rv.id} className="rd-review">
                  <div className="rd-review-top">
                    <Stars value={rv.rating} />
                    <span>{rv.author.toUpperCase()} · {new Date(rv.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                  {rv.text && <div className="rd-review-text">{rv.text}</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Related */}
        {related.length > 0 && (
          <section className="rd-related" aria-labelledby="rd-related-h">
            <h2 id="rd-related-h" className="rd-eyebrow">More like this</h2>
            {related.map((r, i) => <RDRelatedRow key={`${r.title}-${i}`} recipe={r} />)}
          </section>
        )}

        <div style={{ height: 64 }} />
      </div>
      <Footer />

      <style>{`
        .rd a { color: inherit; }
        .rd .rd-wrap { max-width: 980px; margin: 0 auto; padding: 28px 24px 0; }
        .rd .rd-back { display: inline-block; font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: ${RD_INK3}; text-decoration: none; }
        .rd .rd-back:hover { color: ${RD_TEAL}; }
        .rd .rd-hero { margin-top: 22px; padding-bottom: 22px; border-bottom: 2px solid ${RD_INK}; }
        .rd .rd-hero-top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .rd .rd-tag { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; padding: 3px 8px; border-radius: 3px; border: 1px solid ${RD_LINE}; color: ${RD_INK2}; display: inline-flex; align-items: center; gap: 6px; line-height: 1.4; }
        .rd .rd-tag i { width: 7px; height: 7px; border-radius: 999px; display: inline-block; }
        .rd .rd-credit { font-size: 13px; color: ${RD_INK3}; }
        .rd .rd-credit b { color: ${RD_ACC}; font-weight: 600; }
        .rd .rd-h1 { font-family: ${rdDisp}; font-weight: 500; font-variation-settings: 'wdth' 104; font-size: clamp(34px, 5vw, 56px); letter-spacing: -.02em; line-height: 1.02; margin: 14px 0 0; max-width: 20ch; text-wrap: balance; }
        .rd .rd-readings { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 18px; font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 14px; letter-spacing: .06em; color: ${RD_INK}; font-variant-numeric: tabular-nums; }
        .rd .rd-rd i { font-style: normal; font-family: ${rdSans}; font-weight: 700; font-size: 10.5px; letter-spacing: .1em; color: ${RD_INK3}; margin-right: 5px; text-transform: uppercase; }
        .rd .rd-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; }
        .rd .rd-tags span { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; padding: 4px 9px; border-radius: 3px; color: ${RD_INK2}; background: ${RD_PAPER2}; border: 1px solid ${RD_LINE2}; }
        .rd .rd-note { margin: 22px 0 0; padding: 4px 0 4px 20px; border-left: 3px solid ${RD_TEAL}; font-family: ${rdDisp}; font-weight: 500; font-variation-settings: 'wdth' 100; font-size: 22px; line-height: 1.3; letter-spacing: -.01em; color: ${RD_INK}; }
        .rd .rd-note-by { display: block; margin-top: 6px; font-family: ${rdSans}; font-size: 13px; color: ${RD_INK3}; letter-spacing: 0; }
        .rd .rd-eyebrow { font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 11.5px; letter-spacing: .16em; text-transform: uppercase; color: ${RD_ACC}; margin: 0 0 12px; }
        .rd .rd-eyebrow.q { color: ${RD_INK3}; margin: 0; }
        .rd .rd-cols { display: grid; grid-template-columns: 1fr 1.5fr; gap: 36px; margin-top: 30px; }
        .rd .rd-allergen { margin-bottom: 12px; padding: 12px 14px; border-radius: 6px; background: ${RD_AMBER_SOFT}; border: 1px solid rgba(224,168,78,0.45); }
        .rd .rd-allergen-h { font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 10px; letter-spacing: .14em; color: ${RD_AMBER}; margin-bottom: 6px; }
        .rd .rd-allergen-b { font-size: 13.5px; color: ${RD_INK}; line-height: 1.5; }
        .rd .rd-ings { margin: 0; padding: 0; list-style: none; }
        .rd .rd-ings li { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; font-size: 14.5px; color: ${RD_INK}; border-top: 1px solid ${RD_LINE2}; }
        .rd .rd-ings li:first-child { border-top: 0; }
        .rd .rd-ings li i { width: 6px; height: 6px; border-radius: 999px; background: ${RD_TEAL}; margin-top: 8px; flex: none; }
        .rd .rd-steps { margin: 0; padding: 0; list-style: none; }
        .rd .rd-steps li { display: grid; grid-template-columns: 40px 1fr; gap: 14px; padding: 14px 0; font-size: 15px; color: ${RD_INK}; line-height: 1.6; border-top: 1px solid ${RD_LINE2}; }
        .rd .rd-steps li:first-child { border-top: 0; }
        .rd .rd-steps li b { font-family: ${rdDisp}; font-weight: 500; font-variation-settings: 'wdth' 62; font-size: 26px; line-height: 1; color: ${RD_ACC}; }
        .rd .rd-tip { margin-top: 28px; padding: 18px 20px; border-radius: 8px; background: ${RD_TEAL_SOFT}; border: 1px solid rgba(10,143,135,0.3); }
        .rd .rd-tip .rd-eyebrow { color: ${RD_TEAL}; margin-bottom: 8px; }
        .rd .rd-tip-b { font-size: 15px; color: ${RD_INK}; line-height: 1.55; }
        .rd .rd-ctas { margin-top: 28px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
        .rd .rd-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 20px; border-radius: 6px; font: inherit; font-weight: 600; font-size: 14px; border: 1px solid ${RD_TEAL}; color: ${RD_TEAL}; background: transparent; text-decoration: none; white-space: nowrap; cursor: pointer; }
        .rd .rd-btn.p { background: ${RD_TEAL}; color: #fff; }
        .rd .rd-btn.on { background: ${RD_TEAL_SOFT}; }
        .rd .rd-btn:disabled { opacity: .45; cursor: default; }
        .rd .rd-added { font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 12px; letter-spacing: .08em; color: ${RD_TEAL}; }
        .rd .rd-nudge { margin-top: 12px; padding: 12px 16px; border-radius: 8px; background: ${RD_TEAL_SOFT}; border: 1px solid rgba(10,143,135,0.3); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 13.5px; }
        .rd .rd-nudge-b { display: flex; gap: 10px; }
        .rd .rd-fine { margin-top: 10px; font-size: 12.5px; color: ${RD_INK3}; line-height: 1.5; }
        .rd .rd-reviews { margin-top: 48px; border-top: 1px solid ${RD_LINE}; padding-top: 28px; }
        .rd .rd-reviews-h { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .rd .rd-reviews-h h2 { font-family: ${rdDisp}; font-weight: 500; font-variation-settings: 'wdth' 104; font-size: clamp(26px, 4vw, 34px); letter-spacing: -.015em; margin: 0; }
        .rd .rd-reviews-s { display: flex; align-items: center; gap: 8px; font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 12px; color: ${RD_INK3}; }
        .rd .rd-reviews-first { font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: ${RD_INK3}; }
        .rd .rd-review-form { margin-top: 18px; padding: 16px 18px; border-radius: 8px; background: ${RD_PAPER2}; border: 1px solid ${RD_LINE}; }
        .rd .rd-review-rate { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .rd .rd-review-form textarea { width: 100%; box-sizing: border-box; background: ${RD_PAPER}; color: ${RD_INK}; border: 1px solid ${RD_LINE}; border-radius: 6px; padding: 10px 12px; font: inherit; font-size: 14px; resize: vertical; outline: none; }
        .rd .rd-review-form textarea:focus { border-color: ${RD_TEAL}; box-shadow: 0 0 0 3px ${RD_TEAL_SOFT}; }
        .rd .rd-review-post { display: flex; justify-content: flex-end; margin-top: 10px; }
        .rd .rd-review-list { margin-top: 18px; display: flex; flex-direction: column; gap: 12px; }
        .rd .rd-review { padding: 14px 16px; border-radius: 8px; background: ${RD_PAPER2}; border: 1px solid ${RD_LINE2}; }
        .rd .rd-review-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 10px; letter-spacing: .1em; color: ${RD_INK3}; }
        .rd .rd-review-text { font-size: 14px; line-height: 1.5; color: ${RD_INK}; }
        .rd .rd-related { margin-top: 48px; }
        .rd .rd-related .rd-eyebrow { color: ${RD_INK3}; border-bottom: 2px solid ${RD_INK}; padding-bottom: 10px; }
        .rd .rd-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: baseline; padding: 14px 0; border-bottom: 1px solid ${RD_LINE2}; }
        .rd .rd-row-t { font-family: ${rdDisp}; font-weight: 500; font-variation-settings: 'wdth' 100; font-size: 21px; letter-spacing: -.01em; line-height: 1.15; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .rd .rd-row-t a { text-decoration: none; }
        .rd .rd-row-t a:hover { color: ${RD_TEAL}; }
        .rd .rd-row-by { font-size: 12.5px; color: ${RD_INK3}; margin-top: 4px; }
        .rd .rd-row-by b { color: ${RD_ACC}; font-weight: 600; }
        .rd .rd-row-r { display: flex; gap: 18px; align-items: baseline; font-family: ${rdNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 13px; letter-spacing: .06em; color: ${RD_INK}; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .rd button:focus-visible, .rd a:focus-visible, .rd textarea:focus-visible { outline: 2px solid ${RD_TEAL}; outline-offset: 2px; }
        @media (max-width: 760px) {
          .rd .rd-wrap { padding: 22px 18px 0; }
          .rd .rd-cols { grid-template-columns: 1fr; gap: 28px; }
          .rd .rd-h1 { max-width: none; }
          .rd .rd-note { font-size: 19px; }
          .rd .rd-row { display: block; padding: 12px 0; }
          .rd .rd-row-t { font-size: 18px; }
          .rd .rd-row-r { margin-top: 6px; gap: 14px; font-size: 11.5px; color: ${RD_INK2}; }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RecipeDetailPage />);
