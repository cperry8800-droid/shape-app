// Recipe primitives + dataset.
// Loaded by ClientDashboard.html (Today widget), ClientLibrary.html and the
// public Recipes.html page. PAPER / INK / TEAL / TEAL_BRIGHT + sans/serif come
// from pageShell.jsx, which must be loaded first.
//
// Each recipe carries:
//   by      — author name
//   byRole  — "Nutritionist" | "Dietician" | "Chef"
//   diet    — "Vegan" | "Vegetarian" | "Plant-based" | "Seafood" | "Poultry" | "Meat"
// so the Recipes page can filter by creator type and by diet category.

// One mock recipe per weekday. Index 0 = Sunday to match Date#getDay().
const RECIPES_BY_WEEKDAY = [
  {
    title: "One-pan chicken & rice",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Poultry",
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
    by: "Mara Whitfield", byRole: "Dietician", diet: "Vegetarian",
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
    by: "Tom Okafor", byRole: "Nutritionist", diet: "Poultry",
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
    by: "Marco Bellini", byRole: "Chef", diet: "Seafood",
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
    by: "Daniel Reyes", byRole: "Chef", diet: "Meat",
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
    by: "Dr. Priya Nair", byRole: "Dietician", diet: "Seafood",
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
    by: "Aisha Bello", byRole: "Chef", diet: "Vegan",
    time: "20 min", servings: 1, kcal: 540,
    macros: { p: 24, c: 78, f: 14 },
    tags: ["Vegan", "Fiber", "Quick"],
    hero: "linear-gradient(135deg, #d8a64a 0%, #8b5e30 60%, #1a1612 100%)",
    note: "Saturday — easy + carby for a rest day.",
    ingredients: ["1 cup black beans", "1 small sweet potato, cubed", "3 corn tortillas", "1/2 avocado", "Lime, cilantro, hot sauce", "1 tsp cumin"],
    steps: ["Roast sweet potato 18 min at 425°F.", "Warm beans with cumin, mash slightly.", "Char tortillas, build tacos.", "Top with avocado, lime, cilantro, hot sauce."],
  },
];

// Additional recipes for the full Recipes library — spread across creator
// types (Nutritionist / Dietician / Chef) and diet categories.
const RECIPES_EXTRA = [
  {
    title: "Red lentil & spinach dahl",
    by: "James Cole", byRole: "Dietician", diet: "Vegan",
    time: "30 min", servings: 2, kcal: 470,
    macros: { p: 24, c: 68, f: 12 },
    tags: ["Vegan", "Fiber", "Batch"],
    hero: "linear-gradient(135deg, #e0913c 0%, #a34e1f 60%, #1a1612 100%)",
    note: "A cheap, high-fibre staple that reheats beautifully.",
    ingredients: ["1 cup red lentils", "2 cups veg broth", "1 can chopped tomatoes", "2 cups spinach", "Onion, garlic, ginger", "1 tbsp curry powder + 1 tsp cumin"],
    steps: ["Sauté onion, garlic, ginger 4 min.", "Add spices, lentils, tomatoes, broth.", "Simmer 18–20 min until creamy.", "Stir through spinach. Season and serve over rice."],
  },
  {
    title: "Chickpea shakshuka",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Vegetarian",
    time: "25 min", servings: 2, kcal: 430,
    macros: { p: 22, c: 46, f: 18 },
    tags: ["Vegetarian", "Brunch", "One-pan"],
    hero: "linear-gradient(135deg, #d9543b 0%, #e98a2e 55%, #1a1612 100%)",
    note: "Eggs + chickpeas make this a protein-forward brunch.",
    ingredients: ["1 can chickpeas, drained", "1 can chopped tomatoes", "4 eggs", "Onion + red pepper", "Smoked paprika + cumin", "Feta + parsley to finish"],
    steps: ["Soften onion + pepper 6 min.", "Add spices, tomatoes, chickpeas; simmer 8 min.", "Make 4 wells, crack in eggs, cover 5–6 min.", "Top with feta + parsley."],
  },
  {
    title: "Miso-glazed cod with greens",
    by: "Marco Bellini", byRole: "Chef", diet: "Seafood",
    time: "20 min", servings: 1, kcal: 410,
    macros: { p: 42, c: 18, f: 16 },
    tags: ["Seafood", "Low carb", "GF"],
    hero: "linear-gradient(135deg, #6fae8e 0%, #2f6d5b 55%, #1a1612 100%)",
    note: "A restaurant move that takes ten minutes at home.",
    ingredients: ["6 oz cod fillet", "1 tbsp white miso + 1 tsp honey", "1 tsp soy + 1 tsp mirin", "2 cups bok choy", "Sesame seeds", "Spring onion"],
    steps: ["Whisk miso, honey, soy, mirin.", "Brush over cod, broil 8–10 min.", "Steam bok choy 3 min.", "Plate, scatter sesame + spring onion."],
  },
  {
    title: "Tofu & edamame poke bowl",
    by: "Aisha Bello", byRole: "Chef", diet: "Plant-based",
    time: "15 min", servings: 1, kcal: 520,
    macros: { p: 26, c: 64, f: 18 },
    tags: ["Plant-based", "No-cook", "Bowl"],
    hero: "linear-gradient(135deg, #5fbf8f 0%, #3a8f6a 50%, #1a1612 100%)",
    note: "Crispy tofu, cool rice, all the toppings.",
    ingredients: ["6 oz firm tofu, cubed", "3/4 cup sushi rice", "1/2 cup edamame", "Cucumber + carrot", "Avocado", "Soy + sriracha mayo"],
    steps: ["Pan-crisp tofu 6 min, toss in soy.", "Bowl the rice, edamame and veg.", "Add tofu + avocado.", "Drizzle sriracha mayo."],
  },
  {
    title: "Grilled chicken Caesar, lightened",
    by: "Tom Okafor", byRole: "Nutritionist", diet: "Poultry",
    time: "20 min", servings: 1, kcal: 500,
    macros: { p: 50, c: 22, f: 22 },
    tags: ["High protein", "Low carb"],
    hero: "linear-gradient(135deg, #cdb98a 0%, #7e6a3c 55%, #1a1612 100%)",
    note: "Yogurt-based dressing keeps it lean without losing the punch.",
    ingredients: ["6 oz chicken breast", "Romaine, chopped", "2 tbsp Greek yogurt + lemon + garlic", "1 tbsp parmesan", "Anchovy paste, tiny", "Wholegrain croutons, few"],
    steps: ["Grill seasoned chicken 5 min/side, slice.", "Whisk yogurt, lemon, garlic, anchovy, parmesan.", "Toss romaine in dressing.", "Top with chicken + croutons."],
  },
  {
    title: "Beef & broccoli stir-fry",
    by: "Daniel Reyes", byRole: "Chef", diet: "Meat",
    time: "20 min", servings: 1, kcal: 600,
    macros: { p: 45, c: 48, f: 24 },
    tags: ["High protein", "Wok"],
    hero: "linear-gradient(135deg, #7a3320 0%, #b8552f 55%, #1a1612 100%)",
    note: "Hot pan, fast hands — better than takeout.",
    ingredients: ["6 oz flank steak, sliced thin", "3 cups broccoli", "2 tbsp soy + 1 tbsp oyster sauce", "Garlic + ginger", "1 tsp cornstarch slurry", "Rice to serve"],
    steps: ["Sear beef 90 sec, remove.", "Stir-fry broccoli + aromatics 3 min.", "Return beef, add sauce + slurry, toss 1 min.", "Serve over rice."],
  },
  {
    title: "Tempeh & broccoli teriyaki",
    by: "Elena Voss", byRole: "Dietician", diet: "Vegan",
    time: "25 min", servings: 1, kcal: 540,
    macros: { p: 32, c: 58, f: 18 },
    tags: ["Vegan", "High protein", "Meal prep"],
    hero: "linear-gradient(135deg, #b89a3c 0%, #6b6a23 55%, #1a1612 100%)",
    note: "Tempeh brings the protein vegans often miss at dinner.",
    ingredients: ["6 oz tempeh, sliced", "3 cups broccoli", "3 tbsp teriyaki", "Garlic + ginger", "3/4 cup brown rice", "Sesame seeds"],
    steps: ["Steam tempeh 5 min (mellows it).", "Pan-fry tempeh + broccoli 6 min.", "Add teriyaki + aromatics, glaze 2 min.", "Serve over rice with sesame."],
  },
  {
    title: "Tuna niçoise bowl",
    by: "Dr. Priya Nair", byRole: "Dietician", diet: "Seafood",
    time: "15 min", servings: 1, kcal: 480,
    macros: { p: 38, c: 34, f: 22 },
    tags: ["Seafood", "No-cook", "Omega-3"],
    hero: "linear-gradient(135deg, #4f8fb0 0%, #2c5a74 55%, #1a1612 100%)",
    note: "Pantry tuna, fresh veg — done in the time it takes to boil eggs.",
    ingredients: ["1 can tuna in water", "2 eggs, soft-boiled", "Baby potatoes, boiled", "Green beans + cherry tomatoes", "Olives", "Olive oil + dijon vinaigrette"],
    steps: ["Boil eggs (7 min) + potatoes + beans.", "Whisk oil, dijon, lemon.", "Arrange everything in a bowl.", "Flake tuna on top, dress."],
  },
  {
    title: "Roasted veg & halloumi traybake",
    by: "Marco Bellini", byRole: "Chef", diet: "Vegetarian",
    time: "35 min", servings: 2, kcal: 520,
    macros: { p: 26, c: 44, f: 28 },
    tags: ["Vegetarian", "Sheet-pan"],
    hero: "linear-gradient(135deg, #c98a4e 0%, #7e5a2c 55%, #1a1612 100%)",
    note: "Halloumi gets golden and squeaky — no fussing required.",
    ingredients: ["7 oz halloumi, sliced", "Courgette + pepper + red onion", "1 can chickpeas", "2 tbsp olive oil", "Oregano + paprika", "Lemon to finish"],
    steps: ["Toss veg + chickpeas with oil + spices.", "Roast 20 min at 425°F.", "Add halloumi, roast 10 min more.", "Squeeze lemon over. Serve."],
  },
  {
    title: "Quinoa rainbow Buddha bowl",
    by: "Mara Whitfield", byRole: "Dietician", diet: "Plant-based",
    time: "25 min", servings: 1, kcal: 560,
    macros: { p: 22, c: 72, f: 20 },
    tags: ["Plant-based", "Fiber", "Bowl"],
    hero: "linear-gradient(135deg, #6fae5a 0%, #b89a3c 55%, #1a1612 100%)",
    note: "Every colour on the plate — and a tahini drizzle to tie it together.",
    ingredients: ["3/4 cup cooked quinoa", "Roasted sweet potato + chickpeas", "Red cabbage + carrot, raw", "Avocado", "2 tbsp tahini + lemon + water", "Pumpkin seeds"],
    steps: ["Roast sweet potato + chickpeas 20 min.", "Whisk tahini, lemon, water to drizzle.", "Bowl quinoa, roasted + raw veg, avocado.", "Drizzle tahini, scatter seeds."],
  },
  {
    title: "Turkey meatballs in marinara",
    by: "Daniel Reyes", byRole: "Chef", diet: "Poultry",
    time: "30 min", servings: 2, kcal: 580,
    macros: { p: 44, c: 52, f: 20 },
    tags: ["High protein", "Family"],
    hero: "linear-gradient(135deg, #c0432f 0%, #832a1c 55%, #1a1612 100%)",
    note: "Lean turkey, a quick marinara, over pasta or zoodles.",
    ingredients: ["10 oz ground turkey", "1 egg + 1/4 cup breadcrumbs", "Garlic + parmesan + parsley", "1 jar marinara", "Wholewheat pasta", "Basil"],
    steps: ["Mix turkey, egg, crumbs, garlic, parmesan.", "Roll meatballs, brown 6 min.", "Simmer in marinara 12 min.", "Serve over pasta with basil."],
  },
  {
    title: "Smoked salmon & avocado toast",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Seafood",
    time: "10 min", servings: 1, kcal: 440,
    macros: { p: 28, c: 38, f: 20 },
    tags: ["Seafood", "Breakfast", "Omega-3"],
    hero: "linear-gradient(135deg, #e6917a 0%, #b65a48 55%, #1a1612 100%)",
    note: "Five minutes, restaurant brunch energy.",
    ingredients: ["2 slices rye/sourdough", "1/2 avocado", "3 oz smoked salmon", "Lemon + capers", "Dill + cracked pepper", "Optional poached egg"],
    steps: ["Toast bread.", "Mash avocado with lemon, spread.", "Layer salmon, capers, dill.", "Top with pepper (and an egg if you like)."],
  },
  {
    title: "Black-eyed pea & coconut curry",
    by: "James Cole", byRole: "Dietician", diet: "Vegan",
    time: "30 min", servings: 2, kcal: 500,
    macros: { p: 20, c: 66, f: 16 },
    tags: ["Vegan", "Fiber", "Batch"],
    hero: "linear-gradient(135deg, #cf8a3a 0%, #6f8a3c 55%, #1a1612 100%)",
    note: "Creamy, warming, and full of plant protein and fibre.",
    ingredients: ["1 can black-eyed peas", "1 can light coconut milk", "1 can tomatoes", "Onion, garlic, ginger", "Curry powder + turmeric", "Spinach + lime"],
    steps: ["Sauté aromatics 4 min.", "Add spices, tomatoes, coconut milk, peas.", "Simmer 15 min.", "Wilt spinach, finish with lime. Serve over rice."],
  },
  {
    title: "Cauliflower steak, chimichurri",
    by: "Aisha Bello", byRole: "Chef", diet: "Plant-based",
    time: "30 min", servings: 2, kcal: 380,
    macros: { p: 12, c: 34, f: 22 },
    tags: ["Plant-based", "Low cal", "GF"],
    hero: "linear-gradient(135deg, #9abf6a 0%, #4f6d2c 55%, #1a1612 100%)",
    note: "A meatless centrepiece with real char and a punchy sauce.",
    ingredients: ["1 large cauliflower, thick slabs", "2 tbsp olive oil", "Smoked paprika + cumin", "Parsley + cilantro", "Garlic + red wine vinegar", "Chili flakes"],
    steps: ["Brush cauliflower slabs with oil + spice.", "Roast 25 min at 440°F, flipping once.", "Blitz herbs, garlic, vinegar, oil for chimichurri.", "Spoon chimichurri over the steaks."],
  },
];

// Full library used by the Recipes page. Weekday picks first so the
// "recipe of the day" rotation stays self-consistent.
const SHAPE_RECIPES = [...RECIPES_BY_WEEKDAY, ...RECIPES_EXTRA];

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
            {(recipe.byRole || "RECIPE").toUpperCase()} · {recipe.by.toUpperCase()}
          </div>
          <div style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1.1, maxWidth: "calc(100% - 36px)" }}>{recipe.title}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em", marginTop: 10 }}>
            {recipe.time.toUpperCase()} · SERVES {recipe.servings} · {recipe.kcal} KCAL{recipe.diet ? ` · ${recipe.diet.toUpperCase()}` : ""}
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.35)", border: 0, color: "#fff", width: 30, height: 30, borderRadius: 999, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "22px 28px", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 18, marginBottom: 18, flexWrap: "wrap" }}>
            <Macro label="P" value={recipe.macros.p} color="#0ac5a8" />
            <Macro label="C" value={recipe.macros.c} color="#f4b860" />
            <Macro label="F" value={recipe.macros.f} color="#e07856" />
          </div>
          {recipe.note && (
            <div style={{ fontSize: 13, color: "rgba(242,237,228,0.7)", marginBottom: 22, fontStyle: "italic" }}>
              "{recipe.note}" — {recipe.by}{recipe.byRole ? `, ${recipe.byRole}` : ""}
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
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 6 }}>FROM {r.by.toUpperCase()}{r.byRole ? ` · ${r.byRole.toUpperCase()}` : ""}</div>
        <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 8 }}>{r.title}</div>
        <div style={{ fontSize: 13, color: "rgba(242,237,228,0.7)", marginBottom: 10, lineHeight: 1.5 }}>{r.note}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <Macro label="P" value={r.macros.p} color="#0ac5a8" />
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
  window.SHAPE_RECIPES = SHAPE_RECIPES;
}
