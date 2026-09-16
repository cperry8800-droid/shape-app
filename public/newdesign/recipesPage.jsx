// Public Recipes page — "Shape Kitchen", the Menu (owner pick, 2026-09-15, off
// docs/REVIEW-2026-09-15-about-and-kitchen.md §K3). A hundred recipes as a
// typographic list a reader can scan, grouped by how long they take to cook:
// under 15 minutes · 15 to 30 · 30 to 60 · over an hour. A sticky jump row moves
// between the courses, a tools row holds search and the filters as toggles, and
// "Today's board" puts three dishes in large type for someone who does not want
// to choose. Each row is one line: the title, who wrote it, then the readings.
//
// Reuses SHAPE_RECIPES / recipeSlug / recipeAttribution / recipeNeeds /
// recipeMatchesDiet and the saved-recipe helpers from recipes.jsx, and
// Header/Footer from pageShell.jsx (both load first). The palette and the type
// are this page's own — bone paper, green ink, terracotta for the course
// numerals, teal on the controls — with the three families the homepage and the
// Coaches page already moved to (Anybody · Doto · Schibsted Grotesk).
//
// ⚠ Every byline goes through recipeAttribution: a sourced (USDA) recipe carries
// `by: null`, and tests/recipe-web-mobile-parity.test.mjs fails on a raw `.by`
// read anywhere in a newdesign recipe script. Returning null for an uncredited
// recipe renders nothing rather than inventing a name.

// ── Palette + type (page-local; the shell tokens stay the site's dark ones) ──
const KM_PAPER = "#f4eee2";
const KM_PAPER2 = "#faf6ee";
const KM_INK = "#1e2a26";
const KM_INK2 = "rgba(30,42,38,0.72)";
const KM_INK3 = "rgba(30,42,38,0.5)";
const KM_LINE = "rgba(30,42,38,0.14)";
const KM_LINE2 = "rgba(30,42,38,0.07)";
const KM_TEAL = "#0a8f87";
const KM_TEAL_SOFT = "rgba(10,143,135,0.1)";
const KM_ACC = "#b7442b";
const KM_ACC_SOFT = "rgba(183,68,43,0.08)";
// Same stacks as coaches.jsx / client.jsx: the metrics-matched fallbacks are
// declared in the host page's <style>, so a blocked font host still lays out.
const kmDisp = "'Anybody', 'Anybody Fallback', system-ui, sans-serif";
const kmNum = "'Doto', 'Doto Fallback', ui-monospace, monospace";
const kmSans = "'Schibsted Grotesk', 'Schibsted Fallback', 'Space Grotesk', system-ui, sans-serif";
// The diet colour is a SIGNAL beside the word, never the word's own colour: on
// bone paper Vegetarian (#7bc043) and Plant-based (#2ee0c4) fall under 3:1 as
// text. Ink carries the label; the dot carries the colour.
const KM_DIET_COLOR = {
  "Vegan": "#4fae5a", "Vegetarian": "#7bc043", "Plant-based": "#2ee0c4",
  "Seafood": "#3b9ed6", "Poultry": "#e0a84e", "Meat": "#c0533b",
};
// Filter groups come from recipes.jsx; literals only if it has not loaded.
const KM_DIETS = (typeof RECIPE_DIETS !== "undefined" ? RECIPE_DIETS : ["Vegan", "Vegetarian", "Pescatarian", "Mediterranean"]);
const KM_PROTEINS = (typeof RECIPE_PROTEINS !== "undefined" ? RECIPE_PROTEINS : ["Seafood", "Poultry", "Meat"]);
const KM_FREE_FROM = (typeof RECIPE_FREE_FROM !== "undefined" ? RECIPE_FREE_FROM : ["Gluten-free", "Dairy-free"]);
const KM_GOALS = (typeof RECIPE_GOALS !== "undefined" ? RECIPE_GOALS : ["High-protein", "Low-carb"]);
// A course pages at this many rows; "Show all N →" opens the rest. A search
// never pages — a result a reader searched for must not hide behind a button.
// And a course only pages when the button would hide at least KM_PAGE_SLACK
// rows: a door opening onto two more lines is a tap that buys nothing.
const KM_PAGE = 12;
const KM_PAGE_SLACK = 4;
function kmPaged(n) { return n > KM_PAGE + KM_PAGE_SLACK; }

// ── The courses ─────────────────────────────────────────────────────────────
// A recipe's stated time is a compact string ("35 min", "1 hr", "1 hr 15 min");
// the minutes are read off it rather than typed beside it, so the catalog stays
// the one source. Unparseable → null, and the guard in
// tests/recipe-menu-parity.test.mjs asserts every catalog recipe parses — a
// recipe with no readable time would otherwise vanish from a page whose whole
// structure is "by time". That file also drives this page's rules against the
// app's copy of them, so the two surfaces cannot group a recipe differently.
function recipeMinutes(r) {
  const s = String((r && r.time) || "").toLowerCase();
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|m)\b/);
  if (!h && !m) return null;
  return Math.round((h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0));
}
// Bands are half-open on the top edge so 15 min sits in course one and 30 min
// in course two — "under 15" reads as "up to and including a quarter hour",
// which is what a cook means by it.
const KM_COURSES = [
  { key: "under15", title: "Under 15 minutes", short: "≤ 15 min", test: (m) => m <= 15 },
  { key: "c15to30", title: "15 to 30 minutes", short: "15–30 min", test: (m) => m > 15 && m <= 30 },
  { key: "c30to60", title: "30 to 60 minutes", short: "30–60 min", test: (m) => m > 30 && m <= 60 },
  { key: "over60", title: "Over an hour", short: "1 hr +", test: (m) => m > 60 },
];
// Index into KM_COURSES, or -1 for a recipe whose time cannot be read. Every
// recipe lands in EXACTLY one course by construction (the bands partition the
// positive minutes), and the guard proves it over the shipped catalog.
function kmCourseIndex(r) {
  const m = recipeMinutes(r);
  if (m == null || !(m > 0)) return -1;
  return KM_COURSES.findIndex((c) => c.test(m));
}
function kmSortByTime(list) {
  return list.slice().sort((a, b) => {
    const d = (recipeMinutes(a) || 0) - (recipeMinutes(b) || 0);
    return d || String(a.title).localeCompare(String(b.title));
  });
}
function kmIsAuthored(r) {
  const a = typeof recipeAttribution === "function" ? recipeAttribution(r) : null;
  return !!a && a.kind === "authored";
}
// Everything a reader might type: the title, the diet, the tags, the credit and
// the ingredients (strings on the website copy of the catalog).
function kmHaystack(r) {
  const a = typeof recipeAttribution === "function" ? recipeAttribution(r) : null;
  return [r.title, r.diet, ...(r.tags || []), a ? a.name : "", a && a.role ? a.role : "", ...(r.ingredients || [])]
    .join(" ").toLowerCase();
}
// The filter rules, kept pure so they can be driven: Diet + Protein are ONE
// single-select axis (recipeMatchesDiet), Free From + Goals a multi-select layer
// (recipeNeeds, every chosen need must hold), Shape pros = authored only, Saved =
// in the reader's library, and the search over kmHaystack.
function kmMatches(r, f) {
  const needsOf = typeof recipeNeeds === "function" ? recipeNeeds(r) : [];
  if (f.diet && f.diet !== "All" && !(typeof recipeMatchesDiet === "function" ? recipeMatchesDiet(r, f.diet) : r.diet === f.diet)) return false;
  if (f.needs && f.needs.length && !f.needs.every((n) => needsOf.includes(n))) return false;
  if (f.pros && !kmIsAuthored(r)) return false;
  if (f.saved && !(f.savedSlugs && f.savedSlugs.has(recipeSlug(r)))) return false;
  if (f.q) {
    const words = String(f.q).toLowerCase().split(/\s+/).filter(Boolean);
    const hay = kmHaystack(r);
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}
// Today's board: one pro-authored dish from each of the first three courses,
// rotating with the day so the board is different tomorrow, and never the same
// dish twice (the courses are disjoint). Only the unfiltered menu shows it — a
// board of three unfiltered dishes under an active filter would contradict it.
function kmDaySeed(date) {
  const d = date || new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - start) / 86400000);
}
function kmBoardPicks(courses, seed) {
  const out = [];
  courses.slice(0, 3).forEach((c, i) => {
    const pros = c.rows.filter(kmIsAuthored);
    if (!pros.length) return;
    out.push(pros[(seed + i) % pros.length]);
  });
  return out;
}

// ── Pieces ──────────────────────────────────────────────────────────────────
function KmReading({ label, value }) {
  return (
    <span className="km-rd">
      <i>{label}</i>{value}
    </span>
  );
}

// One line of the menu. The title is the link; the ♡ is its own button beside
// the readings, never nested inside the anchor.
function RecipeRow({ recipe, saved, onToggleSave }) {
  const a = typeof recipeAttribution === "function" ? recipeAttribution(recipe) : null;
  const dc = KM_DIET_COLOR[recipe.diet] || KM_TEAL;
  const notes = recipe.allergenNotes || [];
  return (
    <div className="km-row">
      <div className="km-row-main">
        <div className="km-row-t">
          <a href={`/recipes/${recipeSlug(recipe)}`}>{recipe.title}</a>
          {recipe.diet ? (
            <span className="km-tag"><i aria-hidden style={{ background: dc }} />{recipe.diet}</span>
          ) : null}
        </div>
        {/* Two honest ways to be credited: a person with their role, or the
            public-domain source. Plain text on the row; the licence link lives
            on the recipe page. */}
        {a ? (
          <div className="km-row-by">
            {a.kind === "authored"
              ? <>{a.role ? <><b>{a.role}</b> · </> : null}{a.name}</>
              : <>From {a.name}</>}
          </div>
        ) : null}
        {/* Allergen claim note, one line. This list is what the FREE FROM
            toggles return, so a restored "free from" claim carries its caveat
            HERE too, not only on the recipe page. Certification clause only —
            the brand examples are detail-page-only. Coalesced twice: most
            recipes carry no `allergenNotes` key at all (undefined, not []). */}
        {notes.length > 0 ? (
          <div className="km-row-note" title={notes.map((n) => n.certification).join(" · ")}>
            {notes.map((n) => n.certification).join(" · ")}
          </div>
        ) : null}
      </div>
      <div className="km-row-r">
        <KmReading label="Time" value={recipe.time} />
        <KmReading label="Kcal" value={recipe.kcal} />
        <KmReading label="P" value={recipe.macros.p} />
        <KmReading label="C" value={recipe.macros.c} />
        <KmReading label="F" value={recipe.macros.f} />
        <button type="button" className={`km-save${saved ? " on" : ""}`}
          onClick={() => onToggleSave(recipe)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${recipe.title} from your library` : `Save ${recipe.title} to your library`}
          title={saved ? "Saved — click to remove" : "Save to library"}>{saved ? "♥" : "♡"}</button>
      </div>
    </div>
  );
}

function KmToggle({ label, on, onClick, count }) {
  return (
    <button type="button" className={`km-tg${on ? " on" : ""}`} onClick={onClick} aria-pressed={!!on}>
      {label}{typeof count === "number" ? <span className="km-tg-ct">{count}</span> : null}
    </button>
  );
}

function RecipesPage() {
  const all = (typeof SHAPE_RECIPES !== "undefined" ? SHAPE_RECIPES : []);
  const [q, setQ] = React.useState("");
  const [diet, setDiet] = React.useState("All");
  const [needs, setNeeds] = React.useState([]);
  const [pros, setPros] = React.useState(false);
  const [savedOnly, setSavedOnly] = React.useState(false);
  const [expanded, setExpanded] = React.useState(() => new Set());
  const [me, setMe] = React.useState(null); // null = loading, false = signed out, object = user
  const [savedSlugs, setSavedSlugs] = React.useState(() => new Set(typeof getSavedRecipeSlugs === "function" ? getSavedRecipeSlugs() : []));
  const [authNudge, setAuthNudge] = React.useState(false);
  const [activeCourse, setActiveCourse] = React.useState(0);
  // The sticky jump row sits under the site's FIXED header, so its offset is the
  // header's own measured bottom edge — NAV_H (72) on a desktop, plus the 48px
  // "get the app" banner mobile-redirect.js prepends on a phone until it is
  // dismissed. Measured rather than typed, and re-measured when either changes.
  const [stickyTop, setStickyTop] = React.useState(72);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setMe(d && d.user ? d.user : false); })
      .catch(() => { if (!cancelled) setMe(false); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const measure = () => {
      try {
        const h = document.querySelector("header.shape-header");
        const b = h ? Math.round(h.getBoundingClientRect().bottom) : 72;
        setStickyTop(b > 0 ? b : 72);
      } catch (e) {}
    };
    measure();
    window.addEventListener("resize", measure);
    let mo = null;
    try {
      mo = new MutationObserver(measure);
      mo.observe(document.body, { childList: true });
    } catch (e) {}
    const t = setTimeout(measure, 400);
    return () => { window.removeEventListener("resize", measure); if (mo) mo.disconnect(); clearTimeout(t); };
  }, []);

  const loggedIn = !!me;
  const toggleSave = (recipe) => {
    if (!loggedIn) { setAuthNudge(true); return; }
    toggleSavedRecipe(recipeSlug(recipe));
    setSavedSlugs(new Set(getSavedRecipeSlugs()));
  };
  const toggleNeed = (n) => setNeeds((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  const pickDiet = (d) => setDiet((prev) => (prev === d ? "All" : d));
  const searching = q.trim().length > 0;
  const filters = { q: q.trim(), diet, needs, pros, saved: savedOnly, savedSlugs };
  const anyFilter = diet !== "All" || needs.length > 0 || pros || savedOnly;
  const clearAll = () => { setDiet("All"); setNeeds([]); setPros(false); setSavedOnly(false); setQ(""); };

  const savedCount = all.filter((r) => savedSlugs.has(recipeSlug(r))).length;
  const prosCount = all.filter(kmIsAuthored).length;
  const shown = all.filter((r) => kmMatches(r, filters));
  const courses = KM_COURSES.map((c, i) => ({ ...c, rows: kmSortByTime(shown.filter((r) => kmCourseIndex(r) === i)) }));
  // A recipe whose time cannot be read is still on the menu — under its own
  // heading, which renders only when there is one. The catalog has none today.
  const untimed = kmSortByTime(shown.filter((r) => kmCourseIndex(r) === -1));
  const board = (!anyFilter && !searching) ? kmBoardPicks(courses, kmDaySeed()) : [];
  const toggleExpanded = (key) => setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // Scroll spy for the jump row: the last course whose head has passed the
  // sticky row is the one you are reading.
  React.useEffect(() => {
    const onScroll = () => {
      try {
        let idx = 0;
        courses.forEach((c, i) => {
          const el = document.getElementById(`km-${c.key}`);
          if (el && el.getBoundingClientRect().top - stickyTop - 60 <= 0) idx = i;
        });
        setActiveCourse(idx);
      } catch (e) {}
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [stickyTop, shown.length]);

  const jumpTo = (e, key) => {
    e.preventDefault();
    try {
      const el = document.getElementById(`km-${key}`);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.pageYOffset - stickyTop - 52;
      window.scrollTo({ top: y, behavior: "smooth" });
      history.replaceState(null, "", `#km-${key}`);
    } catch (e2) {}
  };

  const creditOf = (r) => {
    const a = typeof recipeAttribution === "function" ? recipeAttribution(r) : null;
    if (!a) return "";
    return a.kind === "authored" ? `${a.role ? a.role + " · " : ""}${a.name}` : `From ${a.name}`;
  };

  return (
    <div className="km" style={{ background: KM_PAPER, color: KM_INK, fontFamily: kmSans, minHeight: "100vh" }}>
      <Header active="Kitchen" />

      <div className="km-wrap">
        {/* Masthead */}
        <div className="km-top">
          <div className="km-eyebrow">Shape Kitchen</div>
          <h1 className="km-h1">The menu<span style={{ color: KM_ACC }}>.</span></h1>
          <p className="km-sub">
            Recipes from Shape's nutritionists and dieticians, and from the public record,
            grouped by how long they take to cook. Open any row for the full page.
          </p>
        </div>

        {/* Tools: search + the filters as toggles. Diet and Protein share one
            single-select axis; Free From and Goals stack. */}
        <div className="km-tools">
          <label className="km-search">
            <span aria-hidden>{"⌕"}</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" />
            {q ? <button type="button" onClick={() => setQ("")} aria-label="Clear search">×</button> : null}
          </label>
          <div className="km-tgs">
            <KmToggle label={"♡ Saved"} on={savedOnly} count={savedCount} onClick={() => { setSavedOnly((v) => !v); if (!loggedIn && !savedOnly) setAuthNudge(true); }} />
            <KmToggle label="Shape pros" on={pros} count={prosCount} onClick={() => setPros((v) => !v)} />
            <span className="km-sep" aria-hidden />
            {KM_DIETS.map((d) => <KmToggle key={d} label={d} on={diet === d} onClick={() => pickDiet(d)} />)}
            <span className="km-sep" aria-hidden />
            {KM_PROTEINS.map((d) => <KmToggle key={d} label={d} on={diet === d} onClick={() => pickDiet(d)} />)}
            <span className="km-sep" aria-hidden />
            {KM_FREE_FROM.map((n) => <KmToggle key={n} label={n} on={needs.includes(n)} onClick={() => toggleNeed(n)} />)}
            <span className="km-sep" aria-hidden />
            {KM_GOALS.map((n) => <KmToggle key={n} label={n} on={needs.includes(n)} onClick={() => toggleNeed(n)} />)}
          </div>
          <div className="km-tools-end">
            {(anyFilter || searching) ? (
              <button type="button" className="km-clear" onClick={clearAll}>Clear ×</button>
            ) : null}
            <span className="km-total">
              {(anyFilter || searching) ? `${shown.length} of ${all.length}` : `${all.length}`}
              {" "}{shown.length === 1 && !(anyFilter || searching) ? "recipe" : "recipes"}
            </span>
          </div>
        </div>

        {/* Account nudge for saving */}
        {authNudge && !loggedIn ? (
          <div className="km-nudge">
            <span>Create a free account to save recipes to your library.</span>
            <span className="km-nudge-b">
              <a href="/signup" className="km-btn p">Create account</a>
              <a href="/login" className="km-btn">Log in</a>
            </span>
          </div>
        ) : null}

        {/* Jump row — sticky under the site header */}
        <nav className="km-jump" aria-label="Jump to a course" style={{ top: stickyTop }}>
          <span className="km-jump-l">Jump to</span>
          {courses.map((c, i) => (
            c.rows.length
              ? <a key={c.key} href={`#km-${c.key}`} className={activeCourse === i ? "on" : ""} onClick={(e) => jumpTo(e, c.key)}><span className="km-jl">{c.title}</span><span className="km-js" aria-hidden>{c.short}</span><span className="km-ct">{c.rows.length}</span></a>
              : <span key={c.key} className="off" aria-disabled="true"><span className="km-jl">{c.title}</span><span className="km-js" aria-hidden>{c.short}</span><span className="km-ct">0</span></span>
          ))}
        </nav>

        {/* Today's board — three pro-authored dishes, one from each of the first
            three courses, different tomorrow. Only on the unfiltered menu. */}
        {board.length > 0 ? (
          <section className="km-board" aria-label="Today's board">
            <div className="km-board-h"><h2>Today's board</h2><span>Different tomorrow</span></div>
            <div className="km-board-f">
              {board.map((r) => (
                <a key={recipeSlug(r)} href={`/recipes/${recipeSlug(r)}`}>
                  <h3>{r.title}</h3>
                  {r.note ? <p>{r.note}</p> : null}
                  <div className="km-board-m">{creditOf(r)} · {r.time} · {r.kcal} kcal</div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* The courses */}
        {shown.length === 0 ? (
          <div className="km-empty">
            {savedOnly && savedCount === 0 && !searching && needs.length === 0 && diet === "All" && !pros ? (
              <>
                <div className="km-empty-h">Your library is empty</div>
                <p>{loggedIn ? "Tap the ♡ on any recipe to save it here." : "Create a free account, then tap the ♡ on any recipe to save it here."}</p>
                {!loggedIn ? <a href="/signup" className="km-btn p">Create account</a> : null}
              </>
            ) : (
              <>
                <div className="km-empty-h">Nothing on the menu matches</div>
                <p>Try fewer filters, or a different word.</p>
                <button type="button" className="km-btn" onClick={clearAll}>Clear everything</button>
              </>
            )}
          </div>
        ) : null}
        {courses.map((c, i) => {
          if (!c.rows.length) return null;
          const open = expanded.has(c.key) || searching;
          const rows = (open || !kmPaged(c.rows.length)) ? c.rows : c.rows.slice(0, KM_PAGE);
          const paged = !open && kmPaged(c.rows.length);
          return (
            <section key={c.key} id={`km-${c.key}`} className="km-course" aria-labelledby={`km-${c.key}-h`}>
              <div className="km-course-h">
                <b aria-hidden>{String(i + 1).padStart(2, "0")}</b>
                <h2 id={`km-${c.key}-h`}>{c.title}</h2>
                <span>{c.rows.length} {c.rows.length === 1 ? "recipe" : "recipes"}</span>
              </div>
              {rows.map((r) => (
                <RecipeRow key={recipeSlug(r)} recipe={r} saved={savedSlugs.has(recipeSlug(r))} onToggleSave={toggleSave} />
              ))}
              {paged ? (
                <div className="km-more"><button type="button" className="km-btn" onClick={() => toggleExpanded(c.key)}>Show all {c.rows.length} →</button></div>
              ) : (expanded.has(c.key) && !searching && kmPaged(c.rows.length)) ? (
                <div className="km-more"><button type="button" className="km-btn" onClick={() => toggleExpanded(c.key)}>Show fewer ↑</button></div>
              ) : null}
            </section>
          );
        })}
        {untimed.length > 0 ? (
          <section id="km-untimed" className="km-course" aria-labelledby="km-untimed-h">
            <div className="km-course-h">
              <b aria-hidden>{"—"}</b>
              <h2 id="km-untimed-h">Time not stated</h2>
              <span>{untimed.length} {untimed.length === 1 ? "recipe" : "recipes"}</span>
            </div>
            {untimed.map((r) => (
              <RecipeRow key={recipeSlug(r)} recipe={r} saved={savedSlugs.has(recipeSlug(r))} onToggleSave={toggleSave} />
            ))}
          </section>
        ) : null}

        <div className="km-foot">
          Public-domain recipes come from USDA MyPlate Kitchen and are credited on every line and every page.
        </div>
      </div>

      <Footer />

      <style>{`
        /* pageShell hides horizontal overflow on html and body (its own line
           1263), and overflow-x: hidden turns body into the scroll box a sticky
           child sticks to — body itself never scrolls, so the jump row scrolled
           away with the page. overflow: clip clips the same overflow WITHOUT
           creating a scroll container, so the row sticks to the viewport. A
           browser that does not know clip keeps hidden and the row simply
           scrolls away, which is the page as it was. */
        html, body { overflow-x: clip; }
        .km a { color: inherit; }
        .km .km-wrap { max-width: 1060px; margin: 0 auto; padding: 0 48px; }
        .km .km-top { padding: 52px 0 18px; text-align: center; border-bottom: 1px solid ${KM_LINE}; }
        .km .km-eyebrow { font-family: ${kmNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: ${KM_ACC}; }
        .km .km-h1 { font-family: ${kmDisp}; font-weight: 500; font-variation-settings: 'wdth' 110; font-size: clamp(40px, 6vw, 60px); letter-spacing: -.02em; line-height: 1.02; margin: 10px 0 0; text-wrap: balance; }
        .km .km-sub { margin: 14px auto 0; font-size: 16.5px; color: ${KM_INK2}; max-width: 60ch; line-height: 1.5; }
        .km .km-tools { display: flex; align-items: center; gap: 10px; padding: 16px 0; border-bottom: 1px solid ${KM_LINE}; flex-wrap: wrap; }
        .km .km-search { display: flex; align-items: center; gap: 8px; border: 1px solid ${KM_LINE}; border-radius: 999px; background: ${KM_PAPER2}; padding: 0 12px 0 16px; height: 40px; min-width: 260px; flex: 1 1 260px; max-width: 360px; color: ${KM_INK3}; }
        .km .km-search input { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; font-size: 14px; color: ${KM_INK}; outline: none; }
        .km .km-search input::placeholder { color: ${KM_INK3}; }
        .km .km-search button { border: 0; background: transparent; color: ${KM_INK3}; font-size: 18px; line-height: 1; cursor: pointer; padding: 6px; }
        .km .km-search:focus-within { border-color: ${KM_TEAL}; box-shadow: 0 0 0 3px ${KM_TEAL_SOFT}; }
        .km .km-tgs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .km .km-tg { border: 1px solid ${KM_LINE}; border-radius: 999px; padding: 8px 12px; font: inherit; font-size: 12.5px; font-weight: 600; color: ${KM_INK2}; background: transparent; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; line-height: 1; min-height: 32px; }
        .km .km-tg:hover { border-color: ${KM_INK3}; }
        .km .km-tg.on { border-color: ${KM_ACC}; color: ${KM_ACC}; background: ${KM_ACC_SOFT}; }
        .km .km-tg-ct { font-family: ${kmNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 10px; letter-spacing: .06em; color: ${KM_INK3}; }
        .km .km-tg.on .km-tg-ct { color: ${KM_ACC}; }
        .km .km-sep { width: 1px; height: 22px; background: ${KM_LINE}; margin: 0 4px; }
        .km .km-tools-end { margin-left: auto; display: flex; align-items: center; gap: 12px; }
        .km .km-clear { border: 0; background: transparent; color: ${KM_TEAL}; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 6px 0; }
        .km .km-total { font-family: ${kmNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 12px; letter-spacing: .06em; color: ${KM_INK3}; white-space: nowrap; }
        .km .km-nudge { margin-top: 14px; padding: 14px 16px; border-radius: 10px; background: ${KM_TEAL_SOFT}; border: 1px solid rgba(10,143,135,0.3); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 14px; }
        .km .km-nudge-b { display: flex; gap: 10px; }
        .km .km-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 18px; border-radius: 6px; font: inherit; font-weight: 600; font-size: 14px; border: 1px solid ${KM_TEAL}; color: ${KM_TEAL}; background: transparent; text-decoration: none; white-space: nowrap; cursor: pointer; }
        .km .km-btn.p { background: ${KM_TEAL}; color: #fff; }
        .km .km-jump { position: sticky; z-index: 5; background: ${KM_PAPER}; display: flex; gap: 6px; align-items: center; padding: 12px 0; border-bottom: 1px solid ${KM_LINE}; font-size: 12.5px; color: ${KM_INK3}; flex-wrap: wrap; }
        .km .km-jump-l { margin-right: 4px; }
        .km .km-jump a, .km .km-jump .off { text-decoration: none; color: ${KM_INK2}; padding: 6px 10px; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: baseline; gap: 6px; }
        .km .km-jump a.on { background: ${KM_INK}; color: ${KM_PAPER}; }
        .km .km-jump a.on .km-ct { color: ${KM_PAPER}; opacity: .7; }
        .km .km-jump .off { opacity: .45; }
        .km .km-js { display: none; }
        .km .km-ct { font-family: ${kmNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 10px; color: ${KM_INK3}; letter-spacing: .06em; }
        .km .km-board { padding: 30px 0 6px; }
        .km .km-board-h { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
        .km .km-board-h h2 { font-family: ${kmNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 14px; letter-spacing: .16em; text-transform: uppercase; color: ${KM_ACC}; margin: 0; }
        .km .km-board-h span { font-size: 12.5px; color: ${KM_INK3}; }
        .km .km-board-f { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
        .km .km-board-f a { text-decoration: none; color: inherit; border-top: 2px solid ${KM_INK}; padding-top: 14px; display: block; }
        .km .km-board-f h3 { font-family: ${kmDisp}; font-weight: 500; font-variation-settings: 'wdth' 108; font-size: 26px; letter-spacing: -.015em; line-height: 1.1; margin: 0 0 8px; text-wrap: balance; }
        .km .km-board-f p { margin: 0; font-size: 13.5px; color: ${KM_INK2}; line-height: 1.45; }
        .km .km-board-m { margin-top: 10px; font-family: ${kmNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 11px; letter-spacing: .08em; color: ${KM_INK3}; }
        .km .km-course { padding: 36px 0 10px; }
        .km .km-course-h { display: flex; align-items: baseline; gap: 16px; border-bottom: 2px solid ${KM_INK}; padding-bottom: 10px; margin-bottom: 6px; }
        .km .km-course-h b { font-family: ${kmDisp}; font-weight: 500; font-variation-settings: 'wdth' 62; font-size: 44px; line-height: 1; color: ${KM_ACC}; letter-spacing: -.01em; }
        .km .km-course-h h2 { font-family: ${kmDisp}; font-weight: 500; font-variation-settings: 'wdth' 104; font-size: 30px; margin: 0; letter-spacing: -.015em; line-height: 1.05; }
        .km .km-course-h span { margin-left: auto; font-size: 13px; color: ${KM_INK3}; white-space: nowrap; }
        .km .km-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: baseline; padding: 14px 0; border-bottom: 1px solid ${KM_LINE2}; }
        .km .km-row-t { font-family: ${kmDisp}; font-weight: 500; font-variation-settings: 'wdth' 100; font-size: 21px; letter-spacing: -.01em; line-height: 1.15; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .km .km-row-t a { text-decoration: none; }
        .km .km-row-t a:hover { color: ${KM_TEAL}; }
        .km .km-tag { font-family: ${kmSans}; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; padding: 2px 7px; border-radius: 3px; border: 1px solid ${KM_LINE}; color: ${KM_INK2}; display: inline-flex; align-items: center; gap: 6px; line-height: 1.4; }
        .km .km-tag i { width: 7px; height: 7px; border-radius: 999px; display: inline-block; }
        .km .km-row-by { font-size: 12.5px; color: ${KM_INK3}; margin-top: 4px; }
        .km .km-row-by b { color: ${KM_ACC}; font-weight: 600; }
        .km .km-row-note { margin-top: 5px; font-size: 12px; line-height: 1.4; color: #8a5a17; }
        .km .km-row-r { display: flex; gap: 18px; align-items: baseline; font-family: ${kmNum}; font-weight: 700; font-variation-settings: 'ROND' 30; font-size: 13px; letter-spacing: .06em; color: ${KM_INK}; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .km .km-rd i { font-style: normal; font-family: ${kmSans}; font-weight: 700; font-size: 10.5px; letter-spacing: .1em; color: ${KM_INK3}; margin-right: 4px; text-transform: uppercase; }
        .km .km-save { border: 0; background: transparent; color: ${KM_INK3}; font-size: 17px; line-height: 1; cursor: pointer; padding: 7px 8px; margin: -7px -4px; min-width: 28px; min-height: 28px; font-family: ${kmSans}; }
        .km .km-save.on { color: ${KM_ACC}; }
        .km .km-save:hover { color: ${KM_ACC}; }
        .km .km-more { display: flex; justify-content: center; padding: 22px 0 0; }
        .km .km-empty { padding: 56px 0 40px; text-align: center; }
        .km .km-empty-h { font-family: ${kmDisp}; font-weight: 500; font-variation-settings: 'wdth' 104; font-size: 30px; letter-spacing: -.015em; margin-bottom: 8px; }
        .km .km-empty p { color: ${KM_INK2}; font-size: 15px; margin: 0 0 18px; }
        .km .km-foot { padding: 52px 0 60px; text-align: center; font-size: 13px; color: ${KM_INK3}; }
        .km button:focus-visible, .km a:focus-visible, .km input:focus-visible { outline: 2px solid ${KM_TEAL}; outline-offset: 2px; }
        @media (max-width: 760px) {
          .km .km-wrap { padding: 0 18px; }
          .km .km-top { padding: 28px 0 14px; }
          .km .km-sub { font-size: 14.5px; }
          .km .km-tools { padding: 12px 0; gap: 10px; }
          .km .km-search { max-width: none; flex-basis: 100%; height: 42px; }
          .km .km-tgs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; width: 100%; padding-bottom: 2px; }
          .km .km-tgs::-webkit-scrollbar { display: none; }
          .km .km-tg { flex: 0 0 auto; }
          .km .km-tools-end { margin-left: 0; width: 100%; justify-content: space-between; }
          .km .km-jump { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding: 10px 0; }
          .km .km-jump::-webkit-scrollbar { display: none; }
          .km .km-jump a, .km .km-jump .off { flex: 0 0 auto; }
          .km .km-jump-l { display: none; }
          .km .km-jl { display: none; }
          .km .km-js { display: inline; }
          .km .km-board-h { flex-direction: column; align-items: flex-start; gap: 2px; }
          .km .km-board-f { grid-template-columns: 1fr; gap: 0; }
          .km .km-board-f a { padding: 10px 0 12px; }
          .km .km-board-f h3 { font-size: 21px; }
          .km .km-course { padding: 22px 0 0; }
          .km .km-course-h b { font-size: 32px; }
          .km .km-course-h h2 { font-size: 21px; }
          .km .km-row { display: block; padding: 12px 0; }
          .km .km-row-t { font-size: 18px; }
          .km .km-row-r { margin-top: 6px; gap: 14px; font-size: 11.5px; color: ${KM_INK2}; }
          .km .km-save { margin-left: auto; }
          .km .km-more .km-btn { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) { .km * { scroll-behavior: auto !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RecipesPage />);
