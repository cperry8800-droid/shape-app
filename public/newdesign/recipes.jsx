// Recipe primitives + dataset.
// Loaded by ClientDashboard.html (Today widget), ClientLibrary.html and the
// public Recipes.html page. PAPER / INK / TEAL / TEAL_BRIGHT + sans/serif come
// from pageShell.jsx, which must be loaded first.
//
// Each recipe carries:
//   by      — author name
//   byRole  — "Nutritionist" | "Dietician"
//   diet    — "Vegan" | "Vegetarian" | "Plant-based" | "Seafood" | "Poultry" | "Meat"
//   steps   — detailed, numbered cooking instructions
//   tip     — a short "pro tip" surfaced in the modal
// so the Recipes page can filter by creator type and by diet category.

// One mock recipe per weekday. Index 0 = Sunday to match Date#getDay().
// Attribution — parity copy of bsRecipeAttribution in
// mobile-app/src/broadsheet/shapeKitchenData.js. Two honest ways to be credited:
// an authored recipe carries by + byRole; a public-domain federal work (USDA
// MyPlate Kitchen, 17 USC § 105) has no author and is credited to its SOURCE.
//
// ⚠ EVERY render of a byline goes through here — including the two live route
// components, recipesPage.jsx and recipeDetailPage.jsx, which are separate script
// files reading the same global catalog. `recipe.by.toUpperCase()` throws a
// TypeError on a sourced recipe and takes the whole page down with it, and fixing
// only the renderers inside THIS file left /recipes broken on the first USDA card.
// tests/recipe-web-mobile-parity.test.mjs fails on a raw `.by` dereference in any
// newdesign script. Returning null for an uncredited recipe is deliberate: render
// nothing rather than invent a name.
function recipeAttribution(r) {
  if (!r || typeof r !== "object") return null;
  var ne = function (v) { return typeof v === "string" && v.trim() ? v.trim() : null; };
  var by = ne(r.by);
  if (by) return { kind: "authored", name: by, role: ne(r.byRole), url: null };
  var source = ne(r.source);
  if (source) return { kind: "sourced", name: source, role: null, url: ne(r.sourceUrl) };
  return null;
}

const RECIPES_BY_WEEKDAY = [
  {
    title: "One-pan chicken and rice",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Poultry",
    time: "30 min", servings: 1, kcal: 640,
    macros: { p: 48, c: 72, f: 18 },
    tags: ["High protein","Pantry","30 min"],
    hero: "linear-gradient(135deg, #e8b06a 0%, #b46a3c 60%, #1a1612 100%)",
    note: "Sunday reset — easy to scale up for meal prep.",
    ingredients: [
      "6 oz chicken thigh, skin-on (330 kcal)",
      "3/4 cup jasmine rice (240 kcal)",
      "1 cup low-sodium chicken broth",
      "2 cloves garlic, minced",
      "1 tsp smoked paprika",
      "1/2 tsp fine salt",
      "1/2 cup frozen peas",
    ],
    steps: [
      "Pat the chicken thigh completely dry and season both sides with the salt and paprika — dry skin is what lets it brown instead of steam.",
      "Heat 1 tsp oil in a small skillet over medium-high. Sear the chicken 3 minutes per side until deeply golden, then lift it onto a plate (it won't be cooked through yet).",
      "Lower the heat to medium, add the minced garlic and rice, and toast for 1 minute, stirring, until the grains smell nutty.",
      "Pour in the broth, scrape up any browned bits from the base, and bring to a gentle simmer.",
      "Nestle the chicken back in, skin-side up, cover tightly, and cook on low for 18 minutes without lifting the lid — it's done when the thickest part hits 165°F.",
      "Stir the frozen peas into the rice, replace the lid, and rest off the heat for 5 minutes. Fork through and serve.",
    ],
    tip: "No lid? Cover the skillet with a plate or foil — trapping the steam is what cooks the rice evenly. Doubles cleanly for two days of lunches; keeps 3 days chilled.",
  },
  {
    title: "Greek yogurt power bowl",
    by: "Mara Whitfield", byRole: "Dietician", diet: "Vegetarian",
    time: "5 min", servings: 1, kcal: 480,
    macros: { p: 38, c: 52, f: 12 },
    tags: ["High protein","No-cook","Breakfast"],
    hero: "linear-gradient(135deg, #f0e0c2 0%, #c9a26a 55%, #1a1612 100%)",
    note: "Monday breakfast — sets the protein bar early.",
    ingredients: [
      "1 cup 0% Greek yogurt (130 kcal)",
      "1 scoop whey protein (120 kcal)",
      "1/2 cup mixed berries",
      "2 tbsp granola",
      "1 tbsp peanut butter (95 kcal)",
      "1 tsp honey",
    ],
    steps: [
      "Spoon the Greek yogurt into a bowl, add the scoop of whey, and let it sit a few seconds so the powder starts to hydrate.",
      "Whisk hard with a fork for about 30 seconds until the powder fully dissolves and the yogurt turns smooth — add a splash of milk if it gets too thick.",
      "Layer the berries over one half and the granola over the other so the granola stays crunchy.",
      "Warm the peanut butter for 10 seconds so it pours, then drizzle it across the top with the honey.",
      "Eat immediately — granola softens fast once it hits the yogurt.",
    ],
    tip: "Prep the yogurt-whey base the night before; add toppings in the morning so the granola never goes soggy.",
  },
  {
    title: "Tempo turkey lettuce cups",
    by: "Tom Okafor", byRole: "Nutritionist", diet: "Poultry",
    time: "20 min", servings: 1, kcal: 520,
    macros: { p: 42, c: 38, f: 22 },
    tags: ["Low carb","Quick"],
    hero: "linear-gradient(135deg, #a3c98c 0%, #5b8a4c 55%, #1a1612 100%)",
    note: "Tuesday — quick spin between sessions.",
    ingredients: [
      "6 oz lean ground turkey (260 kcal)",
      "1 tbsp soy sauce",
      "1 tsp sesame oil",
      "2 cloves garlic, minced",
      "1 tsp fresh ginger, minced",
      "8 leaves butter lettuce",
      "1 carrot, julienned",
      "1/2 cucumber, julienned",
      "to taste sriracha",
    ],
    steps: [
      "Separate the butter lettuce into whole cups, rinse, and pat dry — set them on a plate ready to fill so nothing wilts while you cook.",
      "Heat a dry skillet over medium-high. Add the turkey and press it flat; let it sit undisturbed 2 minutes to build a browned crust before breaking it apart.",
      "Push the meat aside, add the garlic and ginger to the bare pan for 30 seconds until fragrant, then mix into the turkey.",
      "Pour in the soy sauce and sesame oil and toss for 1 minute until the liquid glazes the meat and the pan is almost dry.",
      "Spoon the turkey into the lettuce cups, top with the julienned carrot and cucumber, and finish with a zigzag of sriracha.",
    ],
    tip: "Brown the turkey in a thin layer and resist stirring early — that crust is most of the flavour in a low-carb dish.",
  },
  {
    title: "Sheet-pan salmon, sweet potato and broccoli",
    by: "Marco Bellini", byRole: "Nutritionist", diet: "Seafood",
    time: "35 min", servings: 1, kcal: 620,
    macros: { p: 44, c: 58, f: 22 },
    tags: ["High protein","GF","Sheet-pan"],
    hero: "linear-gradient(135deg, #e07856 0%, #f4b860 50%, #1a1612 100%)",
    note: "Wednesday dinner — pairs with tonight's lift.",
    ingredients: [
      "6 oz salmon fillet (310 kcal)",
      "1 medium sweet potato, cubed (115 kcal)",
      "2 cups broccoli florets",
      "2 tbsp olive oil",
      "1 tsp paprika",
      "1/2 tsp salt, plus pepper",
      "1 lemon, sliced",
    ],
    steps: [
      "Heat the oven to 425°F (220°C) and line a sheet pan with parchment so nothing sticks.",
      "Toss the sweet potato cubes with 1 tbsp oil, the paprika, salt and pepper, spread them out, and roast 15 minutes — a head start so they finish with the fish.",
      "Meanwhile, pat the salmon dry and rub it with a little oil, salt and pepper so it roasts instead of steaming.",
      "Pull the pan out, push the potatoes to one side, and add the broccoli and salmon. Drizzle the remaining oil over the broccoli and lay lemon slices on the fish.",
      "Roast another 12–15 minutes, until the broccoli edges char and the salmon flakes when nudged (internal temp ~125°F for medium).",
      "Squeeze the roasted lemon over everything and serve straight from the pan.",
    ],
    tip: "Cut the sweet potato into even 3/4-inch cubes so none are raw while others turn to mush.",
  },
  {
    title: "Steak and sweet potato hash",
    by: "Daniel Reyes", byRole: "Dietician", diet: "Meat",
    time: "25 min", servings: 1, kcal: 660,
    macros: { p: 46, c: 56, f: 26 },
    tags: ["High protein","Iron-rich"],
    hero: "linear-gradient(135deg, #8b3a28 0%, #c95a3c 55%, #1a1612 100%)",
    note: "Thursday — leg-day refuel.",
    ingredients: [
      "6 oz sirloin steak (340 kcal)",
      "1 sweet potato, diced small (115 kcal)",
      "1/2 onion, sliced",
      "1 bell pepper, diced",
      "1 tbsp olive oil",
      "1/2 tsp garlic powder",
      "1/2 tsp smoked paprika",
    ],
    steps: [
      "Take the steak out of the fridge 15 minutes ahead and season generously with salt — room-temperature meat sears more evenly.",
      "Heat the oil in a skillet over medium. Add the small-diced sweet potato in a single layer and cook 8 minutes, covered, stirring occasionally, until tender with crisp edges.",
      "Add the onion, bell pepper, garlic powder and smoked paprika; cook 5 more minutes until softened and caramelised. Scrape the hash onto a plate.",
      "Turn the heat to high. Sear the steak 3 minutes per side for medium-rare, pressing it down for full contact.",
      "Rest the steak on a board for 4 minutes, then slice it thinly against the grain.",
      "Pile the hash back in the warm pan, fan the steak over the top, and spoon any resting juices back over.",
    ],
    tip: "Always slice steak against the grain; it shortens the muscle fibres so each bite is far more tender.",
  },
  {
    title: "Shrimp and quinoa harvest bowl",
    by: "Dr. Priya Nair", byRole: "Dietician", diet: "Seafood",
    time: "20 min", servings: 1, kcal: 560,
    macros: { p: 40, c: 62, f: 16 },
    tags: ["Pescatarian","Meal prep","GF"],
    hero: "linear-gradient(135deg, #f1a48f 0%, #e07856 55%, #1a1612 100%)",
    note: "Friday — light enough for an evening session.",
    ingredients: [
      "6 oz shrimp, peeled (170 kcal)",
      "3/4 cup cooked quinoa (165 kcal)",
      "1 cup roasted zucchini and peppers",
      "1 tbsp olive oil",
      "1/2 lemon, juiced",
      "2 tbsp feta crumbles",
      "handful parsley, torn",
    ],
    steps: [
      "Pat the shrimp very dry and season with salt and pepper — wet shrimp steam and turn rubbery instead of searing.",
      "Heat the olive oil in a skillet over medium-high until it shimmers and just starts to ripple.",
      "Add the shrimp in a single layer and cook 2 minutes per side, just until they curl into a loose C-shape and turn opaque. A tight O means overcooked.",
      "Squeeze the lemon over the pan to deglaze, swirling the shrimp in the juices for 15 seconds.",
      "Build the bowl: warm quinoa as the base, roasted veg alongside, shrimp on top.",
      "Scatter with feta and torn parsley, and spoon the pan juices over for brightness.",
    ],
    tip: "Cook to colour, not the clock: shrimp are done the moment they're pink and opaque — they keep cooking off the heat. Prepped bowls keep 2 days chilled; add feta on the day.",
  },
  {
    title: "Black bean and sweet potato tacos",
    by: "Aisha Bello", byRole: "Nutritionist", diet: "Vegan",
    time: "20 min", servings: 1, kcal: 540,
    macros: { p: 24, c: 78, f: 14 },
    tags: ["Vegan","Fiber","Quick"],
    hero: "linear-gradient(135deg, #d8a64a 0%, #8b5e30 60%, #1a1612 100%)",
    note: "Saturday — easy and carby for a rest day.",
    ingredients: [
      "1 cup black beans, cooked (220 kcal)",
      "1 small sweet potato, cubed (100 kcal)",
      "3 corn tortillas (150 kcal)",
      "1/2 avocado",
      "1 lime",
      "handful cilantro",
      "to taste hot sauce",
      "1 tsp ground cumin",
    ],
    steps: [
      "Heat the oven to 425°F (220°C). Toss the sweet potato cubes with a little oil, salt and half the cumin and roast 18 minutes until caramelised at the edges.",
      "Meanwhile, warm the black beans with the rest of the cumin and a splash of water; mash about a third of them so the mix clings to the tortilla.",
      "Char the corn tortillas over a gas flame or in a dry skillet, 20 seconds a side, until blistered and pliable.",
      "Mash the avocado with a squeeze of lime and a pinch of salt until spreadable but still chunky.",
      "Build each taco: a swipe of avocado first, then beans, then roasted sweet potato.",
      "Finish with torn cilantro, a squeeze of lime and a few dashes of hot sauce.",
    ],
    tip: "Mashing a portion of the beans is the trick to taco filling that holds together instead of rolling off.",
  },
];

// Additional recipes for the full Recipes library — spread across creator
// types (Nutritionist / Dietician) and diet categories.
const RECIPES_EXTRA = [
  {
    title: "Red lentil and spinach dahl",
    by: "James Cole", byRole: "Dietician", diet: "Vegan",
    time: "30 min", servings: 2, kcal: 470,
    macros: { p: 24, c: 68, f: 12 },
    tags: ["Vegan","Fiber","Batch"],
    hero: "linear-gradient(135deg, #e0913c 0%, #a34e1f 60%, #1a1612 100%)",
    note: "A cheap, high-fibre staple that reheats beautifully.",
    ingredients: [
      "1 cup red lentils (460 kcal)",
      "2 cups vegetable broth",
      "1 can chopped tomatoes",
      "2 cups spinach",
      "1 onion, diced",
      "3 cloves garlic, minced",
      "1 tsp fresh ginger, minced",
      "1 tbsp curry powder",
      "1 tsp ground cumin",
    ],
    steps: [
      "Rinse the red lentils under cold water until it runs clear — this removes surface starch so the dahl isn't gluey.",
      "Warm 1 tbsp oil in a pot over medium heat and soften the diced onion for 4 minutes, then add the minced garlic and ginger for another minute.",
      "Add the curry powder and cumin and toast for 30 seconds, stirring, until fragrant — blooming the spices deepens the flavour.",
      "Tip in the lentils, chopped tomatoes and broth, stir well, and bring the pot up to a boil.",
      "Lower to a simmer and cook 18–20 minutes, stirring now and then, until the lentils collapse into a creamy purée.",
      "Stir the spinach through in handfuls until wilted, season, and loosen with water if needed. Serve over rice.",
    ],
    tip: "Toast the spices in oil before the liquid goes in — the biggest upgrade for any curry. Keeps 4 days chilled and freezes for a month; it thickens overnight, so loosen with water on reheat.",
  },
  {
    title: "Chickpea shakshuka",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Vegetarian",
    time: "25 min", servings: 2, kcal: 430,
    macros: { p: 22, c: 46, f: 18 },
    tags: ["Vegetarian","Brunch","One-pan"],
    hero: "linear-gradient(135deg, #d9543b 0%, #e98a2e 55%, #1a1612 100%)",
    note: "Eggs and chickpeas make this a protein-forward brunch.",
    ingredients: [
      "1 can chickpeas, drained (360 kcal)",
      "1 can chopped tomatoes",
      "4 eggs (280 kcal)",
      "1 onion, diced",
      "1 red pepper, diced",
      "1 tsp smoked paprika",
      "1/2 tsp ground cumin",
      "2 tbsp feta, crumbled",
      "handful parsley",
    ],
    steps: [
      "Warm 1 tbsp oil in an oven-safe skillet over medium and soften the diced onion and red pepper for 6 minutes until slumped and sweet.",
      "Stir in the smoked paprika and cumin and cook 30 seconds to bloom the spices in the hot oil.",
      "Add the chopped tomatoes and drained chickpeas, season, and simmer 8 minutes until the sauce holds a spoon-trail.",
      "Make four wells in the sauce with the back of a spoon and crack an egg into each one.",
      "Cover and cook 5–6 minutes, until the whites are set but the yolks still wobble — or slide under a hot grill for runnier yolks.",
      "Scatter with crumbled feta and parsley and serve with bread for dipping.",
    ],
    tip: "Stop cooking while the yolks still jiggle; they keep setting in the hot sauce on the way to the table.",
  },
  {
    title: "Miso-glazed cod with greens",
    by: "Marco Bellini", byRole: "Nutritionist", diet: "Seafood",
    time: "20 min", servings: 1, kcal: 410,
    macros: { p: 42, c: 18, f: 16 },
    tags: ["Seafood","Low carb"],
    hero: "linear-gradient(135deg, #6fae8e 0%, #2f6d5b 55%, #1a1612 100%)",
    note: "A restaurant move that takes ten minutes at home.",
    ingredients: [
      "6 oz cod fillet (140 kcal)",
      "1 tbsp white miso",
      "1 tsp honey",
      "1 tsp soy sauce",
      "1 tsp mirin",
      "2 cups bok choy, halved",
      "1 tsp sesame seeds",
      "1 spring onion, sliced",
    ],
    steps: [
      "Heat the grill (broiler) to high and line a tray with foil so the sticky glaze can't weld to the pan.",
      "Whisk the miso, honey, soy and mirin into a smooth, glossy glaze — no lumps, it should ribbon off the whisk.",
      "Pat the cod dry, set it on the tray, and brush a thick layer of glaze over the top.",
      "Grill 8–10 minutes, watching closely, until the glaze caramelises to a lacquered amber and the fish flakes at a gentle press. If it darkens too fast, drop the shelf a level.",
      "While it cooks, halve the bok choy and steam or stir-fry it 3 minutes until the stems are crisp-tender.",
      "Plate the cod on the greens and finish with sesame seeds and sliced spring onion.",
    ],
    tip: "Miso burns quickly because of its sugars — keep the fish a few inches from the element and stay by the oven.",
  },
  {
    title: "Tofu and edamame poke bowl",
    by: "Aisha Bello", byRole: "Nutritionist", diet: "Plant-based",
    time: "15 min", servings: 1, kcal: 520,
    macros: { p: 26, c: 64, f: 18 },
    tags: ["Plant-based","No-cook","Bowl"],
    hero: "linear-gradient(135deg, #5fbf8f 0%, #3a8f6a 50%, #1a1612 100%)",
    note: "Crispy tofu, cool rice, all the toppings.",
    ingredients: [
      "6 oz firm tofu, cubed (150 kcal)",
      "3/4 cup sushi rice, cooked (180 kcal)",
      "1/2 cup edamame, shelled",
      "1/2 cucumber, sliced",
      "1 carrot, ribboned",
      "1/2 avocado",
      "1 tbsp soy sauce",
      "1 tbsp sriracha mayo",
    ],
    steps: [
      "Press the tofu: wrap the block in a clean towel and rest a heavy pan on top for 10 minutes to squeeze out water so it crisps instead of steaming.",
      "Cube the tofu and pan-fry in 1 tsp oil over medium-high, 6–8 minutes, turning so several sides turn golden and firm.",
      "Toss the hot tofu in a splash of soy off the heat so it drinks the seasoning in while it's porous.",
      "Spoon the cooled sushi rice into a bowl as the base and season it with a pinch of salt.",
      "Arrange the edamame, sliced cucumber, ribboned carrot and avocado in sections around the rice.",
      "Add the tofu and finish with a drizzle of sriracha mayo just before eating.",
    ],
    tip: "Pressing tofu is non-negotiable for crispiness — the drier the block, the better the crust.",
  },
  {
    title: "Grilled chicken Caesar, lightened",
    by: "Tom Okafor", byRole: "Nutritionist", diet: "Poultry",
    time: "20 min", servings: 1, kcal: 500,
    macros: { p: 50, c: 22, f: 22 },
    tags: ["High protein","Low carb"],
    hero: "linear-gradient(135deg, #cdb98a 0%, #7e6a3c 55%, #1a1612 100%)",
    note: "A yogurt-based dressing keeps it lean without losing the punch.",
    ingredients: [
      "6 oz chicken breast (280 kcal)",
      "1 head romaine, chopped",
      "2 tbsp Greek yogurt",
      "1/2 lemon, juiced",
      "1 clove garlic, grated",
      "1 tbsp parmesan, grated",
      "1/4 tsp anchovy paste",
      "handful wholegrain croutons",
    ],
    steps: [
      "Butterfly or pound the chicken breast to an even thickness so it cooks through without drying out, then season both sides.",
      "Grill or pan-sear over medium-high, 5 minutes per side, until the internal temp hits 165°F with clear grill marks.",
      "Rest the chicken 5 minutes while you make the dressing so the juices settle back in.",
      "Whisk the Greek yogurt with lemon, grated garlic, parmesan and a tiny dab of anchovy paste — the anchovy adds savoury depth without fishiness.",
      "Toss the chopped romaine with just enough dressing to coat lightly — the leaves should glisten, not drip.",
      "Slice the chicken, lay it over the salad, and finish with croutons and extra parmesan.",
    ],
    tip: "Pound the breast to an even thickness — thin tips overcook before thick centres are done, and evenness is the whole game.",
  },
  {
    title: "Beef and broccoli stir-fry",
    by: "Daniel Reyes", byRole: "Dietician", diet: "Meat",
    time: "20 min", servings: 1, kcal: 600,
    macros: { p: 45, c: 48, f: 24 },
    tags: ["High protein","Wok"],
    hero: "linear-gradient(135deg, #7a3320 0%, #b8552f 55%, #1a1612 100%)",
    note: "Hot pan, fast hands — better than takeout.",
    ingredients: [
      "6 oz flank steak, sliced thin (300 kcal)",
      "3 cups broccoli florets",
      "2 tbsp soy sauce",
      "1 tbsp oyster sauce",
      "2 cloves garlic, minced",
      "1 tsp fresh ginger, minced",
      "1 tsp cornstarch",
      "3/4 cup rice, to serve (160 kcal)",
    ],
    steps: [
      "Slice the flank steak as thin as you can across the grain and toss with 1 tsp soy and the cornstarch; rest 10 minutes to tenderise.",
      "Mix the remaining soy, the oyster sauce and 2 tbsp water so the sauce is ready before the pan gets hot.",
      "Get a wok or large skillet smoking hot with 1 tbsp oil. Sear the beef in a single layer 90 seconds without moving it, then flip and remove — it should still be a touch underdone.",
      "Add the broccoli with a splash of water, cover, and steam-fry 3 minutes, until it turns bright green and the water has cooked away.",
      "Uncover, add the garlic and ginger, and toss 30 seconds — just until fragrant, before the garlic can colour and turn bitter.",
      "Return the beef, pour in the sauce, and toss 1 minute until it thickens and glosses everything.",
      "Serve immediately over rice while the broccoli still has snap.",
    ],
    tip: "Cook the beef and broccoli separately and combine at the end — crowding the pan drops the heat and you'll braise, not stir-fry.",
  },
  {
    title: "Tempeh and broccoli teriyaki",
    by: "Elena Voss", byRole: "Dietician", diet: "Vegan",
    time: "25 min", servings: 1, kcal: 540,
    macros: { p: 32, c: 58, f: 18 },
    tags: ["Vegan","High protein","Meal prep"],
    hero: "linear-gradient(135deg, #b89a3c 0%, #6b6a23 55%, #1a1612 100%)",
    note: "Tempeh brings the protein vegans often miss at dinner.",
    ingredients: [
      "6 oz tempeh, sliced (330 kcal)",
      "3 cups broccoli florets",
      "3 tbsp teriyaki sauce",
      "2 cloves garlic, minced",
      "1 tsp fresh ginger, minced",
      "3/4 cup brown rice, cooked (160 kcal)",
      "1 tsp sesame seeds",
    ],
    steps: [
      "Slice the tempeh into thin planks and steam them 5 minutes — this mellows the slightly bitter edge and helps it absorb the glaze.",
      "Pat the planks dry, then pan-fry in 1 tsp oil over medium-high, 3 minutes a side, until golden and crisp.",
      "Add the broccoli and a splash of water, cover, and steam-fry 4 minutes until crisp-tender.",
      "Add the garlic and ginger and stir 30 seconds, until fragrant but not coloured.",
      "Pour in the teriyaki and toss 2 minutes, until it reduces and clings to everything as a sticky glaze.",
      "Spoon over warm brown rice and finish with a scatter of sesame seeds.",
    ],
    tip: "Steam tempeh before frying if you've found it bitter before — it opens up to soak in the sauce. Boxes keep 3 days chilled; the glaze revives with a splash of water on reheat.",
  },
  {
    title: "Tuna niçoise bowl",
    by: "Dr. Priya Nair", byRole: "Dietician", diet: "Seafood",
    time: "15 min", servings: 1, kcal: 480,
    macros: { p: 38, c: 34, f: 22 },
    tags: ["Seafood","No-cook","Omega-3"],
    hero: "linear-gradient(135deg, #4f8fb0 0%, #2c5a74 55%, #1a1612 100%)",
    note: "Pantry tuna, fresh veg — done in the time it takes to boil eggs.",
    ingredients: [
      "1 can tuna in water (120 kcal)",
      "2 eggs (140 kcal)",
      "5 baby potatoes, halved",
      "1 cup green beans, trimmed",
      "6 cherry tomatoes, halved",
      "8 olives",
      "1 tbsp olive oil",
      "1 tsp dijon mustard",
    ],
    steps: [
      "Bring a pot of water to a gentle boil and lower in the eggs for exactly 7 minutes for jammy yolks, then chill in cold water and peel.",
      "In the same water, boil the halved baby potatoes 8 minutes — they will still be firm at this point, which is what you want.",
      "Drop the green beans in for the last 2 minutes, until they are bright and still squeak and a knife slides into the thickest potato with no resistance, then drain everything together.",
      "Whisk the vinaigrette: olive oil, dijon, a squeeze of lemon, salt and pepper, until slightly thickened.",
      "Drain the tuna well and break it into large flakes rather than mashing it fine.",
      "Arrange the potatoes, beans, halved tomatoes, olives and tuna in sections in a bowl, and halve the eggs on top.",
      "Spoon the vinaigrette over everything just before serving so nothing sits soggy.",
    ],
    tip: "Boil eggs and potatoes in the same pot to save time and washing-up — start the eggs, add potatoes alongside.",
  },
  {
    title: "Roasted veg and halloumi traybake",
    by: "Marco Bellini", byRole: "Nutritionist", diet: "Vegetarian",
    time: "35 min", servings: 2, kcal: 520,
    macros: { p: 26, c: 44, f: 28 },
    tags: ["Vegetarian","Sheet-pan"],
    hero: "linear-gradient(135deg, #c98a4e 0%, #7e5a2c 55%, #1a1612 100%)",
    note: "Halloumi gets golden and squeaky — no fussing required.",
    ingredients: [
      "7 oz halloumi, sliced (620 kcal)",
      "1 courgette, chunked",
      "1 red pepper, chunked",
      "1 red onion, wedged",
      "1 can chickpeas, drained (360 kcal)",
      "2 tbsp olive oil",
      "1 tsp dried oregano",
      "1 tsp paprika",
      "1/2 lemon",
    ],
    steps: [
      "Heat the oven to 425°F (220°C) with a rack in the top third so the veg colours instead of stewing.",
      "Chop the courgette, pepper and red onion into similar chunks, drain and dry the chickpeas, and toss everything with the oil, oregano, paprika, salt and pepper.",
      "Spread in a single layer — crowding steams the veg — and roast 20 minutes until starting to colour.",
      "Pat the halloumi slices dry, nestle them among the veg, and roast a further 10 minutes until the cheese is golden and the veg edges char.",
      "Squeeze lemon over the hot tray to cut the richness and serve straight away, while the halloumi is still soft.",
    ],
    tip: "Halloumi turns rubbery as it cools — serve it the moment it comes out of the oven for that squeaky bite.",
  },
  {
    title: "Quinoa rainbow Buddha bowl",
    by: "Mara Whitfield", byRole: "Dietician", diet: "Plant-based",
    time: "25 min", servings: 1, kcal: 560,
    macros: { p: 22, c: 72, f: 20 },
    tags: ["Plant-based","Fiber","Bowl"],
    hero: "linear-gradient(135deg, #6fae5a 0%, #b89a3c 55%, #1a1612 100%)",
    note: "Every colour on the plate — and a tahini drizzle to tie it together.",
    ingredients: [
      "3/4 cup cooked quinoa (165 kcal)",
      "1 small sweet potato, cubed",
      "1/2 can chickpeas, drained (180 kcal)",
      "1 cup red cabbage, sliced",
      "1 carrot, ribboned",
      "1/2 avocado, sliced",
      "2 tbsp tahini",
      "1/2 lemon, juiced",
      "1 tbsp pumpkin seeds",
    ],
    steps: [
      "Heat the oven to 425°F (220°C). Toss the cubed sweet potato and drained chickpeas with oil and salt and roast 20 minutes, shaking halfway, until tender and crisp.",
      "While that roasts, cook the quinoa if needed, and thinly slice the red cabbage and ribbon the carrot.",
      "Make the dressing: whisk the tahini with lemon juice and a pinch of salt — it'll seize and thicken first, then loosen with water a teaspoon at a time until it pours.",
      "Spoon the quinoa into a bowl and arrange the roasted and raw veg in colour-blocked sections.",
      "Add sliced avocado, drizzle generously with the tahini dressing, and scatter with pumpkin seeds.",
    ],
    tip: "Tahini dressing always seizes before it smooths — keep adding water a little at a time and it comes together silky.",
  },
  {
    title: "Turkey meatballs in marinara",
    by: "Daniel Reyes", byRole: "Dietician", diet: "Poultry",
    time: "30 min", servings: 2, kcal: 580,
    macros: { p: 44, c: 52, f: 20 },
    tags: ["High protein","Family"],
    hero: "linear-gradient(135deg, #c0432f 0%, #832a1c 55%, #1a1612 100%)",
    note: "Lean turkey, a quick marinara, over pasta or zoodles.",
    ingredients: [
      "10 oz ground turkey (440 kcal)",
      "1 egg",
      "1/4 cup breadcrumbs",
      "2 cloves garlic, grated",
      "2 tbsp parmesan, grated",
      "handful parsley, chopped",
      "1 jar marinara sauce",
      "5 oz wholewheat pasta (500 kcal)",
      "handful basil",
    ],
    steps: [
      "Combine the turkey, egg, breadcrumbs, grated garlic, parmesan, parsley, salt and pepper and mix with a light hand — overworking makes dense, tough meatballs.",
      "Roll into golf-ball sized rounds with damp hands so the mix doesn't stick to your palms.",
      "Brown them in a little oil over medium-high, turning, about 6 minutes — colour, not cooked through yet.",
      "Pour in the marinara, scraping up the fond, bring to a simmer, and cook gently 12 minutes until the meatballs hit 165°F and the sauce thickens.",
      "Meanwhile, boil the pasta in well-salted water to al dente and reserve a splash of the cooking water.",
      "Toss the pasta with a little sauce (loosen with pasta water), top with meatballs and sauce, and tear basil over.",
    ],
    tip: "Mix the meatball mixture just until combined — the gentler you are, the more tender they stay. Meatballs in sauce keep 3 days chilled and freeze beautifully.",
  },
  {
    title: "Smoked salmon and avocado toast",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Seafood",
    time: "10 min", servings: 1, kcal: 440,
    macros: { p: 28, c: 38, f: 20 },
    tags: ["Seafood","Breakfast","Omega-3"],
    hero: "linear-gradient(135deg, #e6917a 0%, #b65a48 55%, #1a1612 100%)",
    note: "Five minutes, restaurant brunch energy.",
    ingredients: [
      "2 slices rye or sourdough (180 kcal)",
      "1/2 avocado",
      "3 oz smoked salmon (100 kcal)",
      "1/2 lemon",
      "1 tsp capers",
      "2 sprigs fresh dill",
      "to taste cracked black pepper",
    ],
    steps: [
      "Toast the rye or sourdough 3–4 minutes until deeply golden and crisp — a sturdy base stops it going soggy under the toppings.",
      "Mash the avocado with a squeeze of lemon and a pinch of salt, then spread it thickly all the way to the edges.",
      "Drape the smoked salmon over in loose folds rather than flat — the ruffles look and eat better.",
      "Scatter with capers, fresh dill and plenty of cracked black pepper.",
      "For something heartier, slide a poached egg on top and break the yolk just before serving with a final squeeze of lemon.",
    ],
    tip: "For a clean poached egg, use the freshest egg you can and swirl the simmering water into a gentle vortex before dropping it in.",
  },
  {
    title: "Black-eyed pea and coconut curry",
    by: "James Cole", byRole: "Dietician", diet: "Vegan",
    time: "30 min", servings: 2, kcal: 500,
    macros: { p: 20, c: 66, f: 16 },
    tags: ["Vegan","Fiber","Batch"],
    hero: "linear-gradient(135deg, #cf8a3a 0%, #6f8a3c 55%, #1a1612 100%)",
    note: "Creamy, warming, and full of plant protein and fibre.",
    ingredients: [
      "1 can black-eyed peas, drained (320 kcal)",
      "1 can light coconut milk (240 kcal)",
      "1 can chopped tomatoes",
      "1 onion, diced",
      "3 cloves garlic, minced",
      "1 tsp fresh ginger, minced",
      "1 tbsp curry powder",
      "1/2 tsp turmeric",
      "2 cups spinach",
      "1 lime",
    ],
    steps: [
      "Soften the diced onion in 1 tbsp oil over medium heat for 4 minutes, then add the minced garlic and ginger for another minute.",
      "Stir in the curry powder and turmeric and toast 30 seconds until fragrant — bloom them in the oil, not the liquid.",
      "Add the tomatoes and let them cook down 3 minutes until jammy and starting to split.",
      "Pour in the coconut milk and drained black-eyed peas, bring to a gentle simmer, and cook 15 minutes until thickened and glossy.",
      "Wilt the spinach through at the end, finish with a squeeze of lime and salt to taste, and serve over rice.",
    ],
    tip: "A squeeze of lime at the very end lifts a coconut curry — the acidity balances the richness. Keeps 4 days chilled; the flavour is even better on day two.",
  },
  {
    title: "Cauliflower steak, chimichurri",
    by: "Aisha Bello", byRole: "Nutritionist", diet: "Plant-based",
    time: "30 min", servings: 2, kcal: 380,
    macros: { p: 12, c: 34, f: 22 },
    tags: ["Plant-based","Low cal","GF"],
    hero: "linear-gradient(135deg, #9abf6a 0%, #4f6d2c 55%, #1a1612 100%)",
    note: "A meatless centrepiece with real char and a punchy sauce.",
    ingredients: [
      "1 large cauliflower",
      "2 tbsp olive oil (240 kcal)",
      "1 tsp smoked paprika",
      "1/2 tsp ground cumin",
      "1 cup parsley and cilantro, chopped",
      "2 cloves garlic, minced",
      "2 tbsp red wine vinegar",
      "pinch chili flakes",
    ],
    steps: [
      "Heat the oven to 440°F (225°C). Trim the cauliflower and slice it through the core into two or three thick 1-inch 'steaks' — keeping the core attached holds each slab together.",
      "Brush both sides with olive oil and rub with the smoked paprika, cumin, salt and pepper.",
      "Roast 25 minutes, flipping carefully halfway, until the edges are deeply charred and a knife slides through the stem.",
      "Meanwhile, finely chop the parsley and cilantro and stir together with minced garlic, red wine vinegar, chili flakes, the remaining olive oil and a pinch of salt to make the chimichurri.",
      "Let the chimichurri sit 10 minutes so the flavours meld before it meets the heat.",
      "Spoon it generously over the hot cauliflower steaks just before serving.",
    ],
    tip: "Slice through the core, not across it — the stem is the spine that keeps a cauliflower steak in one piece on the flip.",
  },
  {
    title: "Chicken pesto pasta",
    by: "Tom Okafor", byRole: "Nutritionist", diet: "Poultry",
    time: "25 min", servings: 1, kcal: 640,
    macros: { p: 46, c: 66, f: 22 },
    tags: ["High protein","Quick","Family"],
    hero: "linear-gradient(135deg, #8fb36a 0%, #4f6d2c 55%, #1a1612 100%)",
    note: "Weeknight staple — fast, high-protein, and kid-friendly.",
    ingredients: [
      "6 oz chicken breast (280 kcal)",
      "3 oz penne or fusilli (300 kcal)",
      "2 tbsp basil pesto (160 kcal)",
      "8 cherry tomatoes, halved",
      "1 tbsp parmesan, grated",
      "1 tbsp olive oil",
      "pinch salt and pepper",
    ],
    steps: [
      "Bring a large pot of well-salted water to a boil and cook the pasta to al dente; reserve a mug of the starchy cooking water before draining.",
      "Meanwhile, season the chicken and pan-sear in a little olive oil over medium-high, 5 minutes per side, until it hits 165°F; rest, then slice.",
      "Off the heat, toss the drained pasta with the pesto, loosening with a splash of pasta water until it coats every piece.",
      "Fold through the halved cherry tomatoes and the sliced chicken.",
      "Finish with the parmesan and a good crack of black pepper over the top.",
    ],
    tip: "Always save a little pasta water — its starch is what turns pesto into a sauce that clings instead of sliding off.",
  },
  {
    title: "Garlic shrimp linguine",
    by: "Marco Bellini", byRole: "Nutritionist", diet: "Seafood",
    time: "20 min", servings: 1, kcal: 580,
    macros: { p: 34, c: 64, f: 18 },
    tags: ["Seafood","Quick"],
    hero: "linear-gradient(135deg, #e6a06a 0%, #b05a3c 55%, #1a1612 100%)",
    note: "Restaurant scampi, ready before the pasta water's even cooled.",
    ingredients: [
      "6 oz shrimp, peeled (170 kcal)",
      "3 oz linguine (300 kcal)",
      "3 cloves garlic, sliced",
      "splash white wine",
      "1/2 lemon",
      "pinch chili flakes",
      "handful parsley, chopped",
      "2 tbsp olive oil (240 kcal)",
    ],
    steps: [
      "Cook the linguine in well-salted boiling water to al dente; reserve some pasta water before draining.",
      "While it boils, pat the shrimp dry and season with salt so they sear rather than steam.",
      "Warm the olive oil over medium, add the sliced garlic and chili flakes, and cook about 1 minute until fragrant but not browned — burnt garlic turns bitter.",
      "Add the shrimp and cook 2 minutes, turning once, until they curl and turn opaque right through.",
      "Pour in the wine with a squeeze of lemon and let it bubble 1 minute, until the sharpness cooks off and the sauce thickens slightly.",
      "Toss the linguine into the pan with a splash of pasta water, swirling until the sauce turns glossy and coats the strands.",
      "Finish with the chopped parsley, another squeeze of lemon, and a thread of olive oil off the heat.",
    ],
    tip: "Pull the garlic off the heat the moment it's pale gold — bitter, over-browned garlic is the most common way this dish goes wrong.",
  },
  {
    title: "Lentil bolognese",
    by: "James Cole", byRole: "Dietician", diet: "Vegan",
    time: "35 min", servings: 2, kcal: 520,
    macros: { p: 22, c: 84, f: 10 },
    tags: ["Vegan","Fiber","Batch"],
    hero: "linear-gradient(135deg, #b5532f 0%, #6f2f1c 55%, #1a1612 100%)",
    note: "A hearty, high-fibre ragù that nobody misses the meat in.",
    ingredients: [
      "1 cup cooked brown or green lentils (230 kcal)",
      "4 oz spaghetti (400 kcal)",
      "1 can chopped tomatoes",
      "1 onion, finely diced",
      "1 carrot, finely diced",
      "1 stick celery, finely diced",
      "2 cloves garlic, minced",
      "1 tbsp tomato paste",
      "1 tsp dried oregano",
      "1 tbsp olive oil",
    ],
    steps: [
      "Finely dice the onion, carrot and celery and soften them in olive oil over medium heat for 8 minutes — this slow soffritto is the flavour base.",
      "Stir in the garlic, tomato paste and oregano and cook for 1 minute until the paste darkens a shade.",
      "Add the cooked lentils and chopped tomatoes, season, and simmer 15 minutes until thick and rich, adding a splash of water if it tightens.",
      "Meanwhile, cook the spaghetti in well-salted water to al dente; reserve some pasta water.",
      "Toss the pasta through the sauce with a splash of pasta water so it clings to every strand.",
      "Serve with a drizzle of olive oil (and a little vegan parmesan if you like).",
    ],
    tip: "Don't rush the soffritto — eight slow minutes on the onion, carrot and celery is what gives a meatless ragù its depth. The sauce keeps 4 days chilled and freezes for a month.",
  },
  {
    title: "Creamy tomato and white bean pasta",
    by: "Mara Whitfield", byRole: "Dietician", diet: "Vegetarian",
    time: "25 min", servings: 2, kcal: 560,
    macros: { p: 22, c: 82, f: 14 },
    tags: ["Vegetarian","Fiber","Comfort"],
    hero: "linear-gradient(135deg, #e08a5a 0%, #9a4a3a 55%, #1a1612 100%)",
    note: "Creamy without the cream — the white beans do the work.",
    ingredients: [
      "1 can cannellini beans, drained (330 kcal)",
      "4 oz rigatoni (400 kcal)",
      "1 can chopped tomatoes",
      "1 onion, diced",
      "2 cloves garlic, minced",
      "1 tbsp parmesan, grated",
      "handful basil, torn",
      "1 tbsp olive oil",
      "pinch chili flakes",
    ],
    steps: [
      "Soften the diced onion and garlic in olive oil over medium heat for 5 minutes until translucent and sweet.",
      "Add the tomatoes and a pinch of chili flakes and simmer 8 minutes until jammy.",
      "Blend half the cannellini beans with a splash of water and stir them in — they make the sauce creamy without any cream — then add the whole beans.",
      "Meanwhile cook the rigatoni to al dente in well-salted water; reserve some pasta water before draining.",
      "Toss the pasta through the sauce, loosening with pasta water, and stir in the parmesan.",
      "Finish with the torn basil and one more crack of pepper just before it hits the table.",
    ],
    tip: "Blended white beans are a dietitian's trick for a creamy pasta sauce that's higher in fibre and protein than cream.",
  },
  {
    title: "Beef ragu rigatoni",
    by: "Daniel Reyes", byRole: "Dietician", diet: "Meat",
    time: "40 min", servings: 2, kcal: 680,
    macros: { p: 42, c: 70, f: 24 },
    tags: ["High protein","Family"],
    hero: "linear-gradient(135deg, #7a3320 0%, #4a1f14 55%, #1a1612 100%)",
    note: "A quick weeknight ragù with low-and-slow flavour.",
    ingredients: [
      "8 oz lean ground beef (460 kcal)",
      "4 oz rigatoni (400 kcal)",
      "1 can chopped tomatoes",
      "1 onion, diced",
      "1 carrot, diced",
      "2 cloves garlic, minced",
      "splash red wine",
      "1 tbsp tomato paste",
      "1 tbsp parmesan, grated",
      "1 tbsp olive oil",
    ],
    steps: [
      "Brown the ground beef in olive oil over medium-high, pressing it flat and leaving it to crust before breaking it up; lift it out with a slotted spoon.",
      "In the same pan, soften the diced onion, carrot and garlic for 6 minutes until sweet and beginning to colour.",
      "Stir in the tomato paste, cook 1 minute, then deglaze with a splash of red wine, scraping the base.",
      "Return the beef, add the tomatoes, season, and simmer gently 20 minutes until thick.",
      "Cook the rigatoni to al dente; reserve some pasta water and toss the pasta through the ragù with a splash to bind.",
      "Serve topped with the parmesan and a final drizzle of olive oil.",
    ],
    tip: "Let the mince form a brown crust before you stir it — that fond is where a quick ragù gets its slow-cooked taste. The ragù keeps 3 days chilled and freezes well.",
  },
  {
    title: "Chickpea and spinach curry",
    by: "Mara Whitfield", byRole: "Dietician", diet: "Vegan",
    time: "30 min", servings: 4, kcal: 460,
    macros: { p: 22, c: 58, f: 14 },
    tags: ["Vegan","Batch","Freezer"],
    hero: "linear-gradient(135deg, #d99a3c 0%, #7e6a23 55%, #1a1612 100%)",
    note: "The Sunday batch that feeds half the week.",
    ingredients: [
      "2 cans chickpeas, drained (720 kcal)",
      "1 can chopped tomatoes",
      "1 can light coconut milk (240 kcal)",
      "1 large onion, diced",
      "4 cloves garlic, minced",
      "1 tbsp fresh ginger, grated",
      "2 tbsp curry powder",
      "4 cups spinach",
      "1 lemon, juiced",
    ],
    steps: [
      "Warm 1 tbsp oil in your largest pot over medium heat and cook the diced onion 6 minutes, stirring now and then, until soft and golden at the edges.",
      "Add the garlic and ginger and stir 1 minute, until they smell sweet rather than raw.",
      "Stir the curry powder in for 30 seconds, moving it constantly so the spices toast in the oil without catching and turning bitter.",
      "Tip in the tomatoes and simmer 4 minutes until they darken and thicken to a jammy paste — that reduction is the backbone of the sauce.",
      "Add the chickpeas and coconut milk, bring to a gentle simmer, and cook 15 minutes uncovered until the sauce coats a spoon and the chickpeas have softened into it.",
      "Turn off the heat and fold the spinach through in two handfuls until just wilted and still bright green.",
      "Finish with the lemon juice and salt to taste — the curry should taste rich first, then bright.",
    ],
    tip: "Portion into four boxes while warm; it keeps 4 days chilled and freezes for a month. The sauce thickens overnight — loosen with a splash of water when you reheat.",
  },
  {
    title: "Crispy tofu grain bowl",
    by: "Tom Okafor", byRole: "Nutritionist", diet: "Vegan",
    time: "25 min", servings: 1, kcal: 560,
    macros: { p: 30, c: 62, f: 20 },
    tags: ["Vegan","High protein","Bowl"],
    hero: "linear-gradient(135deg, #9a8f3c 0%, #4f6d4c 55%, #1a1612 100%)",
    note: "Cornstarch is the crackle — tofu that actually crunches.",
    ingredients: [
      "7 oz extra-firm tofu, cubed (170 kcal)",
      "1 tbsp cornstarch",
      "3/4 cup cooked farro or brown rice (170 kcal)",
      "1 cup shredded kale",
      "1/2 avocado, sliced",
      "1 tbsp soy sauce",
      "1 tbsp tahini",
      "1/2 lemon, juiced",
      "1 tsp maple syrup",
    ],
    steps: [
      "Press the tofu 10 minutes under a heavy pan, then cut into 3/4-inch cubes and toss with the cornstarch until every face is dusted — that starch coat is what fries into a shell.",
      "Heat 1 tbsp oil in a nonstick skillet over medium-high until shimmering, add the tofu with space between cubes, and fry 8 minutes, turning every 2, until deep golden and rattling-crisp on most sides.",
      "Off the heat, splash the soy over the hot tofu and toss 10 seconds — it hisses, absorbs, and seasons the crust without softening it.",
      "Massage the shredded kale with a pinch of salt and a squeeze of lemon for 30 seconds until it darkens and relaxes.",
      "Whisk the tahini, remaining lemon, maple and a tablespoon of water into a pourable dressing.",
      "Build the bowl: grains, kale, avocado, tofu on top, dressing zigzagged over everything.",
    ],
    tip: "Cornstarch, space in the pan, and patience between turns — break any of the three and the crust goes soft.",
  },
  {
    title: "Overnight oats, three ways",
    by: "Mara Whitfield", byRole: "Dietician", diet: "Vegetarian",
    time: "5 min", servings: 1, kcal: 480,
    macros: { p: 28, c: 58, f: 14 },
    tags: ["Breakfast","No-cook","Meal prep"],
    hero: "linear-gradient(135deg, #d9c28f 0%, #8f7a4a 55%, #1a1612 100%)",
    note: "Five minutes tonight, three breakfasts sorted.",
    ingredients: [
      "1/2 cup rolled oats (190 kcal)",
      "1 scoop whey or plant protein (120 kcal)",
      "3/4 cup milk of choice",
      "2 tbsp Greek yogurt",
      "1 tbsp chia seeds",
      "1 tsp honey or maple",
      "1/2 cup berries, banana or peanut butter",
    ],
    steps: [
      "Whisk the protein powder into the milk first until completely smooth — adding powder to assembled oats leaves pockets of dry dust.",
      "Stir in the oats, chia, yogurt and sweetener in a jar until every oat is submerged, then lid it and chill at least 4 hours or overnight.",
      "In the morning the mix should be thick enough to hold a spoon upright; loosen with a splash of milk if it set too firm.",
      "Top it one of three ways — berries for lightness, banana and cinnamon for a pre-session carb push, or a peanut-butter swirl on rest days.",
    ],
    tip: "Make three jars on Sunday night — they keep 3 days chilled and the chia only improves. Add crunchy toppings in the morning, never the night before.",
  },
  {
    title: "Harissa salmon with couscous",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Seafood",
    time: "20 min", servings: 1, kcal: 580,
    macros: { p: 40, c: 52, f: 22 },
    tags: ["Seafood","Quick","Spice"],
    hero: "linear-gradient(135deg, #d9603b 0%, #8f3a2e 55%, #1a1612 100%)",
    note: "One spoon of harissa does all the heavy lifting.",
    ingredients: [
      "6 oz salmon fillet (310 kcal)",
      "1 tbsp harissa paste",
      "1 tsp honey",
      "1/2 cup couscous, dry (310 kcal)",
      "3/4 cup hot vegetable stock",
      "6 cherry tomatoes, halved",
      "1/2 cucumber, diced",
      "handful mint, torn",
      "1/2 lemon",
    ],
    steps: [
      "Heat the oven to 425°F (220°C). Stir the harissa and honey together and spread the paste over the top of the salmon like a thin plaster.",
      "Roast the salmon on a lined tray 10–12 minutes, until the glaze darkens at the edges and the flesh flakes at a gentle press but still looks silky inside.",
      "While it roasts, pour the hot stock over the couscous in a bowl, cover with a plate, and leave 5 minutes — then fork the grains apart so they don't clump.",
      "Fold the tomatoes, cucumber and most of the mint through the couscous with a squeeze of lemon and a little olive oil.",
      "Sit the salmon on the couscous, scatter the last of the mint over, and finish with the remaining lemon.",
    ],
    tip: "Harissa brands vary wildly in heat — taste yours first and cut it with extra honey if it bites harder than you like.",
  },
  {
    title: "Garlic shrimp and courgette noodles",
    by: "Tom Okafor", byRole: "Nutritionist", diet: "Seafood",
    time: "15 min", servings: 1, kcal: 370,
    macros: { p: 36, c: 14, f: 18 },
    tags: ["Seafood","Low carb","GF"],
    hero: "linear-gradient(135deg, #8fbf7a 0%, #3f7a5a 55%, #1a1612 100%)",
    note: "Scampi energy, a third of the carbs.",
    ingredients: [
      "6 oz shrimp, peeled (170 kcal)",
      "2 medium courgettes, spiralised",
      "3 cloves garlic, sliced",
      "2 tbsp olive oil (240 kcal)",
      "pinch chili flakes",
      "1/2 lemon",
      "handful parsley, chopped",
      "2 tbsp parmesan, grated",
    ],
    steps: [
      "Spiralise the courgettes and salt them lightly in a colander for 10 minutes while you prep — then squeeze and pat them dry so they sauté instead of flooding the pan.",
      "Pat the shrimp dry, season, and sear in 1 tbsp oil over medium-high for 90 seconds a side until pink, opaque and curled to a loose C. Lift them out.",
      "Drop the heat to medium, add the rest of the oil with the garlic and chili flakes, and cook 1 minute until pale gold and fragrant — no browner.",
      "Add the courgette noodles and toss just 60–90 seconds, until barely tender but still with bite — past that they collapse into water.",
      "Return the shrimp with a big squeeze of lemon, toss once, and serve immediately with parsley and parmesan.",
    ],
    tip: "Salt, squeeze and dry the noodles — watery zoodles are the whole reason people give up on them.",
  },
  {
    title: "Cottage cheese protein toast",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Vegetarian",
    time: "5 min", servings: 1, kcal: 340,
    macros: { p: 28, c: 34, f: 10 },
    tags: ["Snack","High protein","No-cook"],
    hero: "linear-gradient(135deg, #e8d9b0 0%, #a68a4a 55%, #1a1612 100%)",
    note: "The between-sessions snack that actually holds you.",
    ingredients: [
      "2 slices wholegrain or sourdough (180 kcal)",
      "3/4 cup cottage cheese (120 kcal)",
      "1 tsp olive oil or honey",
      "pinch flaky salt and pepper",
      "to taste chili flakes or cinnamon",
      "6 cherry tomatoes, or 1/2 cup berries",
    ],
    steps: [
      "Toast the bread until properly golden and rigid — cottage cheese is wet, and a pale slice will sag under it inside a minute.",
      "Spoon the cottage cheese thickly over both slices while the toast is still hot, so the underside just starts to warm.",
      "Go savoury (halved tomatoes, olive oil, flaky salt, chili flakes and pepper) or sweet (berries, honey and cinnamon) — both directions work over the same base.",
      "Eat straight away while the contrast holds: cold curds, warm crunch.",
    ],
    tip: "Whipped in a blender for 20 seconds, cottage cheese turns into a smooth spread even the sceptics eat.",
  },
  {
    title: "Date and almond energy bites",
    by: "Mara Whitfield", byRole: "Dietician", diet: "Plant-based",
    time: "15 min", servings: 4, kcal: 370,
    macros: { p: 10, c: 44, f: 16 },
    tags: ["Snack","No-cook","Batch"],
    hero: "linear-gradient(135deg, #8f6a3c 0%, #4f3a23 55%, #1a1612 100%)",
    note: "A dozen bites in the fridge beats any vending machine.",
    ingredients: [
      "12 Medjool dates, pitted (800 kcal)",
      "1 cup almonds (550 kcal)",
      "1/2 cup rolled oats",
      "2 tbsp cocoa powder",
      "1 tbsp chia seeds",
      "pinch flaky salt",
      "splash water, if needed",
    ],
    steps: [
      "Pulse the almonds and oats in a food processor about 20 seconds, until they're a coarse rubble — stop before it turns to flour or the bites lose their bite.",
      "Add the pitted dates, cocoa, chia and salt and run 60–90 seconds, scraping down once, until the mix clumps and holds when you pinch it; add water a teaspoon at a time only if it stays crumbly.",
      "Roll into 12 walnut-sized balls with lightly damp hands, pressing firmly so they compact.",
      "Chill 30 minutes to set — they go from soft fudge to a clean, firm bite.",
    ],
    tip: "They keep 2 weeks in a sealed box in the fridge and a month in the freezer — three bites is one serving, which is easy to forget.",
  },
  {
    title: "Turkey chili verde",
    by: "Tom Okafor", byRole: "Nutritionist", diet: "Poultry",
    time: "35 min", servings: 4, kcal: 460,
    macros: { p: 42, c: 34, f: 16 },
    tags: ["High protein","Batch","Freezer"],
    hero: "linear-gradient(135deg, #7a9a3c 0%, #3f5a23 55%, #1a1612 100%)",
    note: "The green chili — lighter than red, twice as interesting.",
    ingredients: [
      "1.25 lb lean ground turkey (920 kcal)",
      "1 jar salsa verde (16 oz)",
      "1 can white beans, drained (330 kcal)",
      "1 onion, diced",
      "1 green pepper, diced",
      "3 cloves garlic, minced",
      "2 tsp ground cumin",
      "1 tsp dried oregano",
      "1 cup chicken stock",
      "1 lime, plus cilantro to serve",
    ],
    steps: [
      "Brown the turkey in 1 tbsp oil over medium-high in a wide pot, pressing it into a flat layer and leaving it 3 minutes to crust before breaking it up — colour equals flavour in a lean chili.",
      "Add the onion and green pepper and cook 5 minutes, until softened and translucent at the edges.",
      "Stir in the garlic, cumin and oregano and give it 1 minute, until the whole pot smells toasty.",
      "Pour in the salsa verde, stock and beans, scraping the base clean, and bring to a simmer.",
      "Cook uncovered 20 minutes, stirring occasionally, until the chili thickens enough that a spoon dragged through leaves a trail.",
      "Finish with a big squeeze of lime, taste for salt, and serve with cilantro — and rice, or straight from the bowl.",
    ],
    tip: "Portion into four and it keeps 4 days chilled or 2 months frozen; the verde flavour deepens by day two. A spoon of Greek yogurt on top adds 5 g protein per bowl.",
  },
  {
    title: "Lemon-herb chicken meal-prep box",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Poultry",
    time: "35 min", servings: 4, kcal: 510,
    macros: { p: 44, c: 48, f: 14 },
    tags: ["High protein","Meal prep","Batch"],
    hero: "linear-gradient(135deg, #d9c25a 0%, #8f7a2e 55%, #1a1612 100%)",
    note: "Four lunches, one tray, zero decisions on Wednesday.",
    ingredients: [
      "1.5 lb chicken breast (1000 kcal)",
      "2 lemons — zest and juice",
      "3 cloves garlic, minced",
      "1 tbsp dried oregano",
      "2 tbsp olive oil",
      "1 cup rice, dry (680 kcal)",
      "1 lb green beans, trimmed",
      "1/2 tsp salt, plus pepper",
    ],
    steps: [
      "Whisk the lemon zest and juice, garlic, oregano, oil, salt and pepper; slice the chicken into even 1-inch strips and marinate 10 minutes while the oven heats to 425°F (220°C).",
      "Cook the rice: rinse, then simmer covered on low 15 minutes and rest 5 off the heat — no peeking, the steam does the finishing.",
      "Spread the chicken on one half of a lined sheet pan and the green beans (tossed with a little oil and salt) on the other; roast 16–18 minutes until the chicken hits 165°F and the beans blister.",
      "Rest the chicken 5 minutes so it stays juicy when boxed, then divide rice, beans and chicken across four containers.",
      "Spoon the tray juices over each box before lidding — that's the dressing.",
    ],
    tip: "Boxes keep 4 days chilled. Reheat lidded with a teaspoon of water so the rice steams back; a fresh lemon wedge in each box on day three revives everything.",
  },
];

// Full library used by the Recipes page. Weekday picks first so the
// "recipe of the day" rotation stays self-consistent.
// The 50 USDA MyPlate Kitchen recipes — content-parity copy of
// mobile-app/src/broadsheet/shapeKitchenData.usda.js (string ingredients, per the
// Kitchen Card wave spec §7.6). US federal works, public domain under
// 17 USC § 105, so they carry source/sourceUrl/license and NO byline —
// recipeAttribution() above credits the source instead of inventing an author.
const RECIPES_USDA = [
  {
    title: "Slow-simmered beef pot roast",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/beef-pot-roast", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "2 hr 20 min", servings: 8, kcal: 237,
    macros: { p: 26, c: 1, f: 14 },
    tags: ["High protein","Low carb","Slow-cook"],
    hero: "linear-gradient(135deg, #7b3f1d 0%, #a8632c 55%, #1a1612 100%)",
    note: "A chuck roast that goes fork-tender in one covered pan.",
    ingredients: [
      "2 1/2 lb lean beef chuck roast (1800 kcal)",
      "1 low-sodium beef bouillon cube",
      "2 cups hot water",
      "1 tbsp orange juice",
      "1/4 tsp allspice",
      "1/8 tsp black pepper",
      "1/2 cup chopped onion",
      "2 tbsp water for the pan",
    ],
    steps: [
      "Dissolve the bouillon cube in 2 cups of hot water, stirring until the liquid runs clear with no grit at the bottom, then whisk in the orange juice, allspice and black pepper.",
      "Put 2 tablespoons of water in a deep skillet over medium heat, add the onion and let it simmer 4 to 5 minutes until it turns soft and translucent rather than browned.",
      "Push the onion aside and lay the roast in the dry hot pan, browning it 3 to 4 minutes a side until every face carries a deep crust — that crust is most of the flavour in the finished gravy.",
      "Pour the seasoned broth over the meat, bring it to a bare bubble, then cover the pan tightly and drop the heat to low.",
      "Simmer 2 hours, turning the roast once at the halfway mark, until a fork slides into the centre with no resistance and the liquid has reduced to a glossy pan sauce.",
      "Rest the roast on a board for 10 minutes before slicing it across the grain, then spoon the onions and pan juices over the top.",
    ],
    tip: "Chill the whole thing overnight and the fat lifts off the sauce in a solid sheet. Slices reheat far better in their own juices than dry in a pan.",
  },
  {
    title: "Beef stroganoff with macaroni",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/beef-stroganoff", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "35 min", servings: 5, kcal: 450,
    macros: { p: 34, c: 59, f: 7 },
    tags: ["High protein","Comfort","Family"],
    hero: "linear-gradient(135deg, #8a6b4a 0%, #c9a227 55%, #1a1612 100%)",
    note: "Yogurt stands in for cream and the sauce stays light.",
    ingredients: [
      "1 lb lean top round beef (700 kcal)",
      "2 tsp vegetable oil, divided",
      "3/4 tbsp finely chopped onion",
      "1 lb sliced mushrooms",
      "1/4 tsp salt",
      "1 dash black pepper",
      "1/4 tsp nutmeg",
      "1/2 tsp dried basil",
      "1/4 cup low-sodium beef broth",
      "1 cup plain low-fat yogurt",
      "6 cups cooked macaroni (1200 kcal)",
    ],
    steps: [
      "Cut the beef into 1-inch cubes and pat them dry, because a wet surface steams instead of browning when it hits the pan.",
      "Heat 1 teaspoon of the oil in a non-stick skillet over medium heat and sauté the onion for 2 minutes until it softens and smells sweet.",
      "Add the beef and cook 5 minutes more, turning the cubes so they colour evenly on all sides, then lift them out onto a warm plate.",
      "Add the remaining oil and the mushrooms to the empty skillet, cooking over medium-high until they release their water and it boils away, about 6 minutes.",
      "Return the beef and onion to the pan with the salt, pepper, nutmeg and basil, then stir in the broth and yogurt off the boil.",
      "Warm it gently for 2 to 3 minutes until the sauce coats a spoon — never let it bubble, or the yogurt will split into grains. Serve over the hot macaroni.",
    ],
    tip: "Take the pan off the heat before the yogurt goes in. If it does split, a spoonful of the pasta water whisked in hard will usually pull it back together.",
  },
  {
    title: "Baked pork chops with peppers and onion",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/baked-pork-chops", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "1 hr 50 min", servings: 6, kcal: 268,
    macros: { p: 42, c: 4, f: 9 },
    tags: ["High protein","One-pan","Low carb"],
    hero: "linear-gradient(135deg, #b5482f 0%, #d98c3f 55%, #1a1612 100%)",
    note: "Six chops, one pan, and peppers that do the seasoning.",
    ingredients: [
      "6 lean centre-cut pork chops (1500 kcal)",
      "1 medium onion, thinly sliced",
      "1/2 cup chopped green pepper",
      "1/2 cup chopped red pepper",
      "1/8 tsp black pepper",
      "1/4 tsp salt",
    ],
    steps: [
      "Trim the hard fat from the edge of each chop and lay them in a single layer in a 13x9-inch baking pan so they roast rather than steam.",
      "Scatter the sliced onion and both peppers over the top, then season the whole pan with the black pepper and salt.",
      "Cover and refrigerate for 1 hour — the vegetables weep a little liquid that seasons the meat from above while it sits.",
      "Heat the oven to 375°F (190°C), keep the pan covered, and bake for 30 minutes until the peppers have collapsed and the pan is bubbling.",
      "Uncover, turn each chop, pile the onions and peppers back on top and bake 15 minutes more, until a thermometer in the thickest chop reads 145°F and the juices run clear.",
      "Rest the chops in the pan for 5 minutes, then serve with the pan juices and a little fresh parsley.",
    ],
    tip: "Centre-cut chops go dry fast, so pull the pan the moment it hits 145°F. Leftovers slice cold into a sandwich better than they reheat.",
  },
  {
    title: "Black skillet beef with kale and red potatoes",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/black-skillet-beef-greens-and-red-potatoes", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "55 min", servings: 6, kcal: 383,
    macros: { p: 22, c: 57, f: 9 },
    tags: ["One-pan","Fiber","Family"],
    hero: "linear-gradient(135deg, #3f5d2f 0%, #a03c22 55%, #1a1612 100%)",
    note: "A whole dinner built in one heavy skillet, greens and all.",
    ingredients: [
      "1 lb beef top round (700 kcal)",
      "8 medium red potatoes, halved (1150 kcal)",
      "1 tbsp paprika",
      "1 1/2 tsp oregano",
      "1/2 tsp chilli powder",
      "1/4 tsp garlic powder",
      "1/4 tsp black pepper",
      "1/8 tsp crushed red pepper",
      "1/8 tsp dry mustard",
      "3 cups finely chopped onions",
      "2 cups reduced-sodium beef broth",
      "2 large garlic cloves, minced",
      "2 large carrots in thin strips",
      "4 cups kale leaves",
    ],
    steps: [
      "Freeze the beef for 30 minutes until it firms up, then slice it across the grain into strips about 1/8 inch thick and 3 inches wide.",
      "Mix the paprika, oregano, chilli powder, garlic powder, black pepper, crushed red pepper and dry mustard, and toss the strips until every piece is coated.",
      "Spray a large heavy skillet with cooking spray and preheat it over high heat until a drop of water skitters, then add the meat and stir-fry for 5 minutes until the spices darken and smell toasted.",
      "Add the potatoes, onion, broth and garlic, cover, and cook over medium heat for 20 minutes so the potatoes braise in the seasoned liquid rather than fry.",
      "Stir in the carrot strips, lay the kale over the top in a loose blanket, cover again and cook about 15 minutes, until the carrots give easily to a knife tip and the kale has wilted down into the broth.",
      "Taste for heat, then bring the skillet to the table and spoon it into bowls with the broth.",
    ],
    tip: "Cast iron gives the best crust here, but do not leave the acidic broth sitting in it overnight. Reheat with a splash of water to loosen the potatoes.",
  },
  {
    title: "Beef pozole with hominy",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/beef-pozole-soup", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "1 hr 45 min", servings: 10, kcal: 284,
    macros: { p: 27, c: 9, f: 16 },
    tags: ["High protein","Soup","Batch"],
    hero: "linear-gradient(135deg, #a3301f 0%, #e0a33c 55%, #1a1612 100%)",
    note: "Cubed beef and hominy, simmered until the broth turns red.",
    ingredients: [
      "2 lb lean beef, cubed (1600 kcal)",
      "1 tbsp olive oil",
      "1 large onion, chopped",
      "1 clove garlic, finely chopped",
      "1/4 tsp salt",
      "1/8 tsp black pepper",
      "1/4 cup cilantro",
      "15 oz low-sodium stewed tomatoes",
      "2 oz low-sodium tomato paste",
      "29 oz canned hominy, drained (600 kcal)",
    ],
    steps: [
      "Heat the olive oil in a large heavy pot over medium-high until it shimmers, then brown the beef cubes in two batches so the pan never crowds and cools.",
      "Return all the meat to the pot with the onion, garlic, salt, pepper and cilantro, and pour in just enough water to cover the meat by a finger's width.",
      "Cover and cook over low heat for about an hour, at a lazy bubble rather than a rolling boil, until a cube crushes against the side of the pot with light pressure.",
      "Stir in the stewed tomatoes and tomato paste and cook uncovered for 20 minutes, until the broth turns a deep brick red and tastes rounded rather than sharp.",
      "Add the drained hominy and simmer another 15 minutes over low heat, stirring now and then so the kernels do not catch on the bottom.",
      "Thin with a splash of water if it has gone stew-thick, and serve with lime and shredded cabbage on the side.",
    ],
    tip: "Pozole is better on day two, once the hominy has drunk up the broth. Freeze it in single portions and add fresh cilantro after reheating.",
  },
  {
    title: "Skillet beef and cabbage",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/beef-and-cabbage-dinner-tonight", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "30 min", servings: 4, kcal: 235,
    macros: { p: 23, c: 17, f: 9 },
    tags: ["Quick","One-pan","Fiber"],
    hero: "linear-gradient(135deg, #6f7d3a 0%, #b7573a 55%, #1a1612 100%)",
    note: "Cheap, fast, and better once the cabbage catches some colour.",
    ingredients: [
      "1 lb 90% lean ground beef (800 kcal)",
      "1 head green cabbage, chopped (200 kcal)",
      "1 medium onion, chopped",
      "1 tsp garlic powder",
      "1/4 tsp black pepper",
      "2 sprays non-stick cooking spray",
      "to taste red pepper flakes",
    ],
    steps: [
      "Cut the cabbage into bite-sized pieces and chop the onion first, because once the pan is hot this dish moves quickly.",
      "Brown the ground beef in a large skillet over medium heat for 7 to 8 minutes, breaking it up until no pink remains, then drain the fat and set the meat aside.",
      "Wipe the skillet, spray it lightly and cook the onion over medium heat for about 5 minutes until it turns soft and glassy at the edges.",
      "Add the cabbage and cook 8 to 10 minutes without stirring too often, letting it wilt and pick up brown patches — that browning is what keeps it from tasting boiled.",
      "Stir the beef back in with the garlic powder, black pepper and a pinch of red pepper flakes, and heat through for 2 minutes before tasting for salt.",
    ],
    tip: "Give the cabbage room; a crowded pan steams it grey. In a smaller skillet, cook it in two batches and combine at the end.",
  },
  {
    title: "Ground beef and root vegetable stew",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/ground-beef-stew", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "45 min", servings: 4, kcal: 253,
    macros: { p: 15, c: 40, f: 4 },
    tags: ["Budget","Comfort","Batch"],
    hero: "linear-gradient(135deg, #9c4a22 0%, #d1873a 55%, #1a1612 100%)",
    note: "Half a pound of beef stretched across a full pot of stew.",
    ingredients: [
      "1/2 lb lean ground beef (400 kcal)",
      "2 medium potatoes, diced (300 kcal)",
      "6 medium carrots, sliced",
      "1 cup diced onion",
      "10 1/2 oz condensed tomato soup",
      "10 1/2 oz water, one soup can full",
      "1/8 tsp salt",
      "1/8 tsp black pepper",
    ],
    steps: [
      "Brown the ground beef in a deep frying pan over medium heat for about 6 minutes, breaking it into small crumbles so it disperses through the finished stew.",
      "Drain off any fat and season lightly with the salt and black pepper while the meat is still hot and takes seasoning best.",
      "Pour in the condensed tomato soup and a full soup can of water, scraping the bottom of the pan to lift the browned bits into the liquid.",
      "Add the potatoes, carrots and onion, bring the pan to a boil, then cover and drop to a low simmer for about 25 minutes, until a knife slides through a potato cube cleanly.",
      "Pull the pan off the heat and leave it covered for a final 10 minutes — the starch from the potatoes thickens the broth as it settles.",
    ],
    tip: "This thickens further in the fridge; loosen it with a splash of water when reheating. It freezes well for up to three months.",
  },
  {
    title: "Grilled skirt steak with salsa criolla",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/argentinean-grilled-steak-salsa-criolla", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "1 hr 20 min", servings: 4, kcal: 231,
    macros: { p: 26, c: 2, f: 13 },
    tags: ["High protein","Low carb","Quick"],
    hero: "linear-gradient(135deg, #8e2f28 0%, #c25a2e 55%, #1a1612 100%)",
    note: "Six minutes on the grill, and a raw tomato sauce to cut it.",
    ingredients: [
      "1 lb skirt steak (800 kcal)",
      "1 large ripe tomato, chopped",
      "1/4 small red onion, chopped",
      "2 tbsp fresh parsley, chopped",
      "2 tsp extra virgin olive oil (80 kcal)",
      "2 tsp red wine vinegar",
      "1/2 tsp minced garlic",
      "1/4 tsp oregano leaf",
      "1/4 tsp adobo seasoning",
      "1/8 tsp crushed red pepper",
    ],
    steps: [
      "Stir the tomato, red onion, parsley, olive oil, vinegar, garlic, oregano, half the adobo and the crushed red pepper together in a small bowl.",
      "Cover the salsa and refrigerate at least 1 hour so the onion loses its bite and the tomato juice turns into a loose dressing.",
      "Heat a grill to medium-high — you should not be able to hold a hand over the grate for more than three seconds — and oil the bars well.",
      "Season the steak on both sides with the remaining adobo and grill it, flipping once, for about 6 minutes total, until both faces are well browned and the centre reads 145°F.",
      "Let the steak rest on a board for 5 minutes so the juices settle, then slice it thinly against the grain and spoon the cold salsa criolla over the warm meat.",
    ],
    tip: "Skirt steak is all grain, so slicing across it is the difference between tender and chewy. The salsa keeps two days in the fridge.",
  },
  {
    title: "Shorba lamb and peanut soup",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/shorba-lamb-and-peanut-soup", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "2 hr 15 min", servings: 8, kcal: 270,
    macros: { p: 20, c: 17, f: 14 },
    tags: ["Soup","Batch","Fiber"],
    hero: "linear-gradient(135deg, #8a5a2b 0%, #c98a4b 55%, #1a1612 100%)",
    note: "Lamb broth thickened with peanut butter and sharpened by lemon.",
    ingredients: [
      "3 lb lamb bones or lean beef ribs (1400 kcal)",
      "4 tbsp peanut butter (380 kcal)",
      "8 cups water",
      "1 1/2 cups roughly chopped onions",
      "1/2 lb carrots in chunks",
      "1 head cabbage in small wedges",
      "3 cups trimmed string beans",
      "3 cloves garlic, finely chopped",
      "juice of 1 lemon",
      "2 tsp salt, optional",
    ],
    steps: [
      "Put the lamb bones in a 6-quart saucepan with 8 cups of water and the salt, bring it up to a bare simmer and hold it there for one hour, skimming the grey foam off the top.",
      "Add the onions, carrots, cabbage wedges, string beans and garlic and simmer, uncovered, for a second hour until every vegetable collapses under a spoon.",
      "Lift out the bones and any loose gristle, then purée the soup in batches until it is smooth and the colour of pale caramel.",
      "Thin the peanut butter with the lemon juice in a small bowl until it is pourable, then stir it into the hot soup off the boil so it emulsifies instead of seizing.",
      "Return the pot to low heat for 5 minutes, taste for salt and lemon, and stir in cooked rice if you want it to eat as a full meal.",
    ],
    tip: "Chill the broth after the first hour and lift the set fat off the top for a much cleaner soup. Add the peanut butter only after puréeing.",
  },
  {
    title: "Braised chicken thighs with wilted spinach",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/braised-chicken-thighs-spinach", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "50 min", servings: 4, kcal: 234,
    macros: { p: 28, c: 8, f: 10 },
    tags: ["High protein","Low carb","One-pan"],
    hero: "linear-gradient(135deg, #6b8f4e 0%, #a8763a 55%, #1a1612 100%)",
    note: "Deep-browned thighs finished in their own herby broth.",
    ingredients: [
      "4 boneless chicken thighs (700 kcal)",
      "1 tsp vegetable oil",
      "1/2 tsp salt",
      "1/2 tsp black pepper",
      "1 small yellow onion, chopped",
      "3 cloves garlic, minced",
      "1 tsp dried thyme",
      "1/2 tsp dried rosemary",
      "1 cup water",
      "10 oz frozen spinach (70 kcal)",
    ],
    steps: [
      "Pat the thighs completely dry and season both sides with the salt and pepper — a dry surface is what browns instead of steams.",
      "Film a heavy skillet with the oil over medium-high heat and lay the thighs top-side down, cooking each side about 4 minutes until deeply browned, then lift them onto a plate.",
      "Drop the heat to medium and add the onion, garlic, thyme and rosemary, stirring about 5 minutes until the onion turns soft and golden at the edges.",
      "Return the chicken to the pan, pour in the cup of water, cover, and braise about 30 minutes until the meat is tender and reads 165°F at the thickest point.",
      "Stir in the frozen spinach and cook 10 minutes more, or wilt fresh spinach in about 2 minutes, then serve straight from the pan with all the juices.",
    ],
    tip: "The braising liquid is thin on purpose — spoon it over rice or bread rather than reducing it. Keeps three days chilled and reheats gently in the same pan.",
  },
  {
    title: "Roasting-pan chicken with potatoes and carrots",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/baked-chicken-vegetables", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "1 hr 15 min", servings: 6, kcal: 296,
    macros: { p: 27, c: 32, f: 6 },
    tags: ["High protein","One-pan","Family"],
    hero: "linear-gradient(135deg, #c98a2e 0%, #7d5a2a 55%, #1a1612 100%)",
    note: "A whole chicken roasted straight over the root veg.",
    ingredients: [
      "1 whole chicken, cut up and skinned (900 kcal)",
      "4 medium potatoes, sliced (600 kcal)",
      "6 medium carrots, sliced (150 kcal)",
      "1 large onion, quartered",
      "1/2 cup water",
      "1 tsp dried thyme",
      "1/4 tsp ground black pepper",
    ],
    steps: [
      "Heat the oven to 400°F (200°C) and scatter the sliced potatoes, carrots and quartered onion across a large roasting pan in one loose layer.",
      "Lay the skinned chicken pieces on top of the vegetables so everything the chicken gives up during roasting drips straight down into them.",
      "Whisk the water with the thyme and black pepper, then pour it evenly over the chicken and vegetables so nothing sits dry.",
      "Roast about 1 hour, spooning the pan juices back over the chicken once or twice, until the pieces are browned and read 165°F at the thickest part.",
      "Test a potato with a knife tip — it should slide in with no resistance. Give it another 10 minutes if it drags, then serve straight from the pan.",
    ],
    tip: "Slice the potatoes no thicker than a coin or they will still be firm when the chicken is done. Leftovers reheat best uncovered in a hot oven, not a microwave.",
  },
  {
    title: "Mango and peanut chicken wraps",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/asian-mango-chicken-wraps", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "20 min", servings: 4, kcal: 411,
    macros: { p: 28, c: 47, f: 13 },
    tags: ["High protein","Quick","Fiber"],
    hero: "linear-gradient(135deg, #e8a33d 0%, #8a9c4a 55%, #1a1612 100%)",
    note: "Cold-crunch wraps held together by a peanut spread.",
    ingredients: [
      "2 ripe mangos, peeled and diced",
      "1 1/2 cups roasted chicken, chopped (330 kcal)",
      "2 green onions, sliced",
      "2 tbsp fresh basil, chopped",
      "1/2 red bell pepper, chopped",
      "1 1/2 cups Napa cabbage, shredded",
      "2 medium carrots, grated",
      "1/3 cup fat-free cream cheese",
      "3 tbsp creamy peanut butter (285 kcal)",
      "2 tsp reduced-sodium soy sauce",
      "4 whole-wheat tortillas, 8 inch (600 kcal)",
    ],
    steps: [
      "Dice the mangos, chop the pepper and basil, shred the cabbage and grate the carrots, then toss the lot with the chicken in a large bowl.",
      "In a small bowl, whisk the cream cheese, peanut butter and soy sauce until completely smooth — it needs to be thick enough to grip the filling.",
      "Warm each tortilla for about 20 seconds in a dry pan over low heat so it rolls without splitting along the fold.",
      "Spread a quarter of the peanut mixture right to the edges of each tortilla, pile the mango and chicken mix down the centre, and roll up tightly, tucking in the ends.",
      "Secure with toothpicks and chill at least 20 minutes before cutting each wrap in half — the filling sets and the slices hold their shape.",
    ],
    tip: "Use a mango that gives slightly under your thumb; rock-hard fruit tastes of nothing here. Wrapped tightly they keep overnight in the fridge without going soggy.",
  },
  {
    title: "Apricot-lemon skillet chicken",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/apricot-lemon-chicken", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "20 min", servings: 4, kcal: 222,
    macros: { p: 28, c: 18, f: 3 },
    tags: ["High protein","Quick","Pantry"],
    hero: "linear-gradient(135deg, #e0a12c 0%, #c4632a 55%, #1a1612 100%)",
    note: "Four pantry things, one pan, twelve minutes of cooking.",
    ingredients: [
      "4 medium boneless chicken breasts (700 kcal)",
      "1 tsp ground cumin",
      "5 tbsp apricot spread (200 kcal)",
      "juice of 1 fresh lemon",
      "2 tbsp water",
    ],
    steps: [
      "Rub the cumin over both sides of the chicken breasts, pressing it in so it toasts against the hot pan instead of sitting loose on top.",
      "Set a skillet over medium-high heat and cook the breasts 6 minutes per side, until the surface is golden and the centre reads 165°F.",
      "Move the chicken to a warm plate and tent it loosely with foil while you build the sauce in the same unwashed pan.",
      "Lower the heat to medium, add the apricot spread, lemon juice and water, and stir 2 to 3 minutes until the glaze is smooth and just coats the back of a spoon.",
      "Spoon the warm sauce straight over the chicken and serve — any longer on the heat and the apricot tightens into candy.",
    ],
    tip: "Any fruit spread works here, but something tart beats something sweet. If the glaze splits or stiffens, a splash of water off the heat brings it back.",
  },
  {
    title: "Asparagus and mandarin chicken rice bowl",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/asparagus-mandarin-orange-chicken-and-rice", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "30 min", servings: 4, kcal: 461,
    macros: { p: 33, c: 57, f: 11 },
    tags: ["High protein","Bowl","Meal prep"],
    hero: "linear-gradient(135deg, #7fae3f 0%, #e3922c 55%, #1a1612 100%)",
    note: "Bright, cold-friendly bowl that travels in a lunchbox.",
    ingredients: [
      "3 cups cooked instant brown rice (650 kcal)",
      "12 oz cooked chicken breast, cubed (560 kcal)",
      "3 1/3 cups fresh asparagus, trimmed",
      "2 cans mandarin oranges, 11 oz each",
      "2 tbsp extra virgin olive oil (240 kcal)",
      "2 tbsp rice vinegar",
      "3 tbsp reserved mandarin juice",
      "1 tbsp reduced-sodium soy sauce",
    ],
    steps: [
      "Whisk the olive oil, rice vinegar, reserved mandarin juice and soy sauce in a small bowl and set the vinaigrette aside to mingle.",
      "Cook the instant brown rice to the package directions, then spread it out on a tray so it cools fast rather than steaming itself into a clump.",
      "Lay the trimmed asparagus flat in a wide skillet with about 1 1/2 inches of water, bring to a boil, then reduce and simmer uncovered 2 to 5 minutes.",
      "Pull the spears while they still snap, rinse under cool running water to lock in the green, and cut them into 1-inch pieces.",
      "Toss the cooled rice, asparagus, chicken and drained oranges in a large bowl, pour over the vinaigrette, and serve at room temperature.",
    ],
    tip: "Dress it only just before eating if you are packing it ahead, otherwise the asparagus dulls. The reserved can juice is the whole point of the dressing — do not tip it away.",
  },
  {
    title: "Turkey tetrazzini bake",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/eves-tasty-turkey-tetrazzini", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "1 hr", servings: 8, kcal: 379,
    macros: { p: 32, c: 39, f: 12 },
    tags: ["High protein","Batch","Comfort"],
    hero: "linear-gradient(135deg, #d8c187 0%, #8a6a3c 55%, #1a1612 100%)",
    note: "The good way to spend leftover roast turkey.",
    ingredients: [
      "8 oz whole-wheat fettuccine (800 kcal)",
      "4 cups cooked turkey, chopped (800 kcal)",
      "4 tbsp unsalted light butter",
      "2 cups mushrooms, sliced",
      "1 tsp dried thyme",
      "1/2 cup all-purpose flour",
      "2 cups reduced-sodium chicken broth",
      "1 1/2 cups skim milk",
      "1/2 cup slivered almonds, toasted (400 kcal)",
      "1 cup frozen peas",
      "2 tbsp grated Parmesan cheese",
    ],
    steps: [
      "Heat the oven to 400°F (205°C) and lightly grease a 9x9-inch baking dish while a large pot of water comes up to a rolling boil.",
      "Cook the whole-wheat pasta about 2 minutes short of the package time — it finishes in the oven, and mushy pasta is the only real way to lose this dish.",
      "Melt the butter in a saucepan over medium heat, add the mushrooms and thyme, and cook about 5 minutes until they soften and give up their liquid.",
      "Stir in the flour, then whisk in the broth and milk slowly, bring to a boil and simmer 5 minutes until the sauce is thick enough to coat a spoon.",
      "Fold in the turkey, almonds, peas and drained pasta, tip it all into the dish and scatter the Parmesan evenly over the top.",
      "Bake 25 to 35 minutes until the sauce bubbles at the edges and the cheese is golden, then rest 15 minutes so it sets before you cut into it.",
    ],
    tip: "Start with a third of a cup of flour and add more only if the sauce stays loose — too much and it goes pasty. It freezes well in portions before baking.",
  },
  {
    title: "Chicken pozole with hominy and lime",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/chicken-pozole-soup", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "2 hr", servings: 6, kcal: 286,
    macros: { p: 27, c: 26, f: 8 },
    tags: ["High protein","Soup","Batch"],
    hero: "linear-gradient(135deg, #b83c22 0%, #d9a441 55%, #1a1612 100%)",
    note: "Brick-red broth, plump hominy, a hard squeeze of lime.",
    ingredients: [
      "1 whole chicken, skinned and cut up (900 kcal)",
      "8 cups water",
      "1/2 cup onion, chopped",
      "1/4 tsp black pepper",
      "4 tbsp chili powder",
      "8 oz low-sodium tomato sauce",
      "1/2 tsp dried oregano",
      "5 cups canned hominy, rinsed (600 kcal)",
      "3 cups iceberg lettuce, shredded",
      "1 lime, cut into 6 wedges",
    ],
    steps: [
      "Put the skinned chicken pieces in a large pot, cover with the 8 cups of water, and simmer over medium heat for 1 hour without letting it reach a hard boil.",
      "Stir in the onion, pepper, chili powder, tomato sauce and oregano, and keep the pot at a lazy simmer so the broth takes on colour.",
      "Lift the cooked chicken out, pull the meat off the bones once it is cool enough to handle, and return the meat to the pot.",
      "Add the rinsed hominy and simmer another 45 minutes, until the kernels are plump and split and the broth has gone deep brick red.",
      "Ladle into bowls and finish each with shredded lettuce and a lime wedge — the raw crunch and acid are what make it read as pozole.",
    ],
    tip: "Rinse the canned hominy properly or the broth turns cloudy and tinny. It tastes better the next day, so make the whole pot even for two people.",
  },
  {
    title: "Sizzling chicken and broccoli over brown rice",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/brown-rice-sizzling-chicken-and-vegetables", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "30 min", servings: 4, kcal: 436,
    macros: { p: 30, c: 56, f: 10 },
    tags: ["High protein","One-pan","Family"],
    hero: "linear-gradient(135deg, #4f8b3b 0%, #b4562a 55%, #1a1612 100%)",
    note: "A proper stir-fry pace: everything prepped before the oil.",
    ingredients: [
      "3 cups hot cooked brown rice (650 kcal)",
      "16 oz boneless chicken breast, cubed (530 kcal)",
      "3 tbsp reduced-sodium soy sauce",
      "1/4 cup water",
      "1 tbsp honey",
      "1 tbsp cornstarch",
      "1 1/2 tbsp canola oil (180 kcal)",
      "2 cloves garlic, minced",
      "1 small white onion, in wedges",
      "3 medium carrots, thinly sliced",
      "1 1/2 cups small broccoli florets",
      "1 medium red bell pepper, chopped",
    ],
    steps: [
      "Stir the soy sauce, water, honey and cornstarch together in a small bowl and set it right beside the stove — the last 30 seconds move fast.",
      "Heat the oil in a wok or wide skillet over high heat, add the minced garlic, and stir about 1 minute until it turns pale gold and smells sweet.",
      "Add the cubed chicken and cook 5 to 6 minutes until it is opaque all the way through, then push it up against the side of the pan.",
      "Cook the onion, carrots, broccoli and pepper one at a time in the bare centre of the pan, pushing each to the side as it turns tender-crisp and glossy.",
      "Pour the sauce into the empty centre and stir until it thickens and goes shiny, then fold everything back together and serve over the hot brown rice.",
    ],
    tip: "Cutting the chicken and all the veg before you light the burner is the whole technique. If the pan crowds and starts steaming, work in two batches.",
  },
  {
    title: "Herbed baked salmon with lemon",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/baked-salmon-herbs-lemon", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "35 min", servings: 4, kcal: 229,
    macros: { p: 21, c: 1, f: 15 },
    tags: ["Omega-3","Low carb","GF"],
    hero: "linear-gradient(135deg, #e8825c 0%, #b8492f 55%, #1a1612 100%)",
    note: "Dried herbs, lemon and a hot oven — salmon in half an hour.",
    ingredients: [
      "16 oz salmon fillets (760 kcal)",
      "1 1/2 tbsp margarine, melted (150 kcal)",
      "1 tbsp lemon juice",
      "1/4 tsp paprika",
      "1/4 tsp garlic powder",
      "1/4 tsp onion powder",
      "1/8 tsp dried oregano",
      "1/8 tsp dried thyme",
      "1/8 tsp black pepper",
    ],
    steps: [
      "Heat the oven to 350°F (175°C) and pat the salmon dry, then cut it into four even pieces — surface water steams the fish instead of roasting it.",
      "Lay the pieces in a 13x9-inch baking pan with a little space between them, so hot air circulates and the edges colour rather than sweat.",
      "Stir the paprika, garlic and onion powders, pepper, oregano and thyme together in a small bowl, then scatter the mix evenly over the fish.",
      "Sprinkle over the lemon juice and drizzle the melted margarine on top — the fat carries the herbs and keeps the surface from drying out.",
      "Bake 20 to 25 minutes, until the salmon turns opaque through and flakes when you nudge it with a fork at the thickest point.",
    ],
    tip: "Frozen fillets work, but thaw them overnight in the fridge and blot them well — a wet fillet poaches in its own liquid and never takes colour. Leftovers keep three days and are good cold over salad.",
  },
  {
    title: "Catfish stew with brown rice",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/catfish-stew-and-rice", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "45 min", servings: 4, kcal: 384,
    macros: { p: 23, c: 59, f: 7 },
    tags: ["Fiber","Soup","Budget"],
    hero: "linear-gradient(135deg, #d9633a 0%, #7d5a2e 55%, #1a1612 100%)",
    note: "A one-pot Southern fish stew, thick with cabbage and potato.",
    ingredients: [
      "1 lb catfish fillets (470 kcal)",
      "2 cups cooked brown rice (440 kcal)",
      "2 medium potatoes (320 kcal)",
      "14.5 oz low-sodium diced tomatoes",
      "1 cup chopped onion",
      "2 cloves garlic, minced",
      "1/2 head cabbage, coarsely chopped",
      "1 1/2 tbsp chilli and spice seasoning",
      "2 cups water",
      "handful sliced green onions",
    ],
    steps: [
      "Quarter the potatoes and drop them into a large pot with the tomatoes and their juice, the onion, garlic and two cups of water.",
      "Bring to a boil over high heat, then cover and cook at medium-low for 10 minutes, until the potatoes give a little to a knife tip.",
      "Add the cabbage, return to a boil, then reduce the heat and cook covered 5 minutes more, stirring once so it wilts evenly.",
      "Meanwhile cut the catfish into 2-inch lengths and coat the pieces all over with the chilli and spice seasoning.",
      "Slide the fish into the pot, lower the heat and simmer covered 5 minutes, until it turns opaque and flakes easily with a fork.",
      "Ladle into bowls over a scoop of hot brown rice and finish with sliced green onion for a bit of raw bite against the stew.",
    ],
    tip: "Any firm white fish stands in for catfish — just add it in the last five minutes, whatever you use, or it falls apart into the broth. The stew thickens overnight and reheats well.",
  },
  {
    title: "Salmon and pineapple skewers over brown rice",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/hearty-salmon-skewers-over-brown-rice", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "35 min", servings: 4, kcal: 345,
    macros: { p: 25, c: 32, f: 13 },
    tags: ["High protein","Omega-3","Bowl"],
    hero: "linear-gradient(135deg, #f0a03c 0%, #c25236 55%, #1a1612 100%)",
    note: "Salmon, pineapple and tomato on a stick, over nutty rice.",
    ingredients: [
      "1 lb salmon (760 kcal)",
      "2 cups cooked brown rice (440 kcal)",
      "1 cup pineapple, cubed (80 kcal)",
      "3 cherry tomatoes, halved",
      "1 lemon",
      "2 tbsp canola oil, for the pan",
      "to taste salt, pepper and paprika",
    ],
    steps: [
      "Cook the brown rice to package directions and keep it covered and warm while you build the skewers.",
      "Cut the salmon into 24 half-inch cubes and season them all over with kosher salt, ground pepper and paprika.",
      "Thread a cube of salmon, then a tomato half, then a cube of pineapple onto each skewer, repeating until the skewers are full.",
      "Heat the oil in a large skillet over medium-high for a minute, until it shimmers — a cool pan makes the fish stick and tear.",
      "Lay in the skewers and turn every 2 minutes, squeezing lemon over as they cook, until the salmon is opaque right to the centre.",
      "Serve two skewers over half a cup of rice per plate, with one last squeeze of lemon to cut the sweetness of the pineapple.",
    ],
    tip: "Soak wooden skewers in water for 20 minutes first or they scorch and splinter in the pan. Cut the salmon into even cubes — a mixed bag of sizes means some pieces are dry before the rest are done.",
  },
  {
    title: "Tuna and chickpea antipasti salad",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/mediterranean-tuna-antipasti-salad", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "15 min", servings: 4, kcal: 371,
    macros: { p: 23, c: 22, f: 23 },
    tags: ["Omega-3","Fiber","Bowl"],
    hero: "linear-gradient(135deg, #8fa14a 0%, #c0623c 55%, #1a1612 100%)",
    note: "Tuna, chickpeas and walnuts over romaine — no stove needed.",
    ingredients: [
      "10 oz water-packed chunk tuna (310 kcal)",
      "15.5 oz low-sodium garbanzo beans (440 kcal)",
      "2/3 cup walnuts, coarsely chopped (520 kcal)",
      "2 tbsp extra virgin olive oil",
      "2 tbsp lemon juice",
      "1/2 cup red onion, finely chopped",
      "1/2 cup red bell pepper, chopped",
      "2 tbsp fresh parsley, chopped",
      "4 cups romaine hearts, shredded",
    ],
    steps: [
      "Drain the tuna well and flake it into a large bowl — wet tuna waters down the dressing and the salad goes slack within minutes.",
      "Add the walnuts, red onion, bell pepper and parsley with the rinsed garbanzo beans, and mix lightly so the beans stay whole.",
      "Whisk the lemon juice and olive oil in a small bowl until it thickens slightly, then drizzle it over and stir to coat everything.",
      "Season with salt and pepper and leave it 10 minutes in the fridge, so the onion softens and the beans take on the dressing.",
      "Spread the shredded romaine over a platter or divide it between bowls, then spoon the antipasti mixture on top and serve cold.",
    ],
    tip: "Dress it no more than an hour ahead — the lemon wilts the romaine and the walnuts go soft. Keep the salad and the leaves in separate containers if you are packing it for lunch.",
  },
  {
    title: "Chargrilled tilapia tacos with peach salsa",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/grilled-fish-tacos-peach-salsa", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "25 min", servings: 4, kcal: 364,
    macros: { p: 28, c: 47, f: 8 },
    tags: ["High protein","Family","Quick"],
    hero: "linear-gradient(135deg, #f2a65a 0%, #a83c2b 55%, #1a1612 100%)",
    note: "Charred tilapia and cold peach salsa in a warm tortilla.",
    ingredients: [
      "1 lb tilapia fillets (430 kcal)",
      "8 6-inch flour tortillas (1000 kcal)",
      "15.25 oz peach halves, drained (280 kcal)",
      "1/2 red bell pepper, chopped",
      "1/4 red onion, finely chopped",
      "1 jalapeno, seeded and chopped",
      "1 tbsp fresh cilantro, chopped",
      "2 tsp lemon juice",
      "1 tbsp chilli powder",
      "1/4 tsp adobo seasoning",
      "1 packet low-sodium sazon seasoning",
    ],
    steps: [
      "Stir the chopped peaches, bell pepper, red onion, jalapeno, cilantro and lemon juice in a bowl, then cover and chill until serving.",
      "Heat a grill or grill pan over medium-high — it should be hot enough that a flick of water skitters and vanishes on contact.",
      "Pat the tilapia dry with paper towels, then rub it all over with the chilli powder, adobo and sazon until evenly coated.",
      "Lay the fish on greased grates and cook about 8 minutes, flipping once, until opaque and flaking easily at 145°F (63°C).",
      "Slice the fish thinly, then fill each warmed tortilla with half a fillet and about a third of a cup of the cold peach salsa.",
    ],
    tip: "Make the salsa first so it has time to sit — the onion and jalapeno need twenty minutes in the lemon juice to lose their raw edge. Tilapia is delicate, so flip it once and only once.",
  },
  {
    title: "Neapolitan tuna fettuccine with capers",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/neopolitan-tuna-fettuccine", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "25 min", servings: 4, kcal: 345,
    macros: { p: 18, c: 56, f: 8 },
    tags: ["Fiber","Pantry","Family"],
    hero: "linear-gradient(135deg, #c94f38 0%, #6f7f3a 55%, #1a1612 100%)",
    note: "Store-cupboard tuna, tomatoes and olives on whole grain pasta.",
    ingredients: [
      "8 oz whole grain fettuccine (800 kcal)",
      "5 oz canned tuna in water (150 kcal)",
      "14.5 oz diced tomatoes, no salt (100 kcal)",
      "1 tbsp olive oil",
      "1 small onion, diced",
      "2 cloves garlic, minced",
      "2 tsp capers",
      "1/4 cup sliced ripe olives",
      "to taste salt and ground pepper",
    ],
    steps: [
      "Boil the fettuccine in well-salted water to package directions, then scoop out a cup of the cooking liquid before draining it.",
      "Meanwhile warm the olive oil in a 10-inch skillet over medium heat and cook the onion and garlic about 5 minutes, until soft and translucent.",
      "Add the diced tomatoes and capers and simmer 5 minutes, until the sauce tightens and smells sweet rather than raw and tinny.",
      "Fold in the tuna and olives off the boil, season with salt and pepper, and keep the flakes large — stirring hard shreds them to paste.",
      "Toss the drained pasta through the sauce, loosening it with the reserved cooking water until it coats every strand, and serve at once.",
    ],
    tip: "That starchy pasta water is what makes the sauce cling, so reserve it before you drain — plain water will only thin things out. Rinse the capers if they taste sharply of brine.",
  },
  {
    title: "Cumin-lime shrimp over cauliflower rice",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/cumin-lime-shrimp-over-creamy-cauliflower-risotto", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "20 min", servings: 2, kcal: 317,
    macros: { p: 7, c: 20, f: 26 },
    tags: ["Fiber","Quick","Bowl"],
    hero: "linear-gradient(135deg, #9fbf5a 0%, #4e7a4a 55%, #1a1612 100%)",
    note: "Cumin shrimp on a bright green avocado-cauliflower base.",
    ingredients: [
      "8 medium shrimp, peeled and deveined",
      "10 oz frozen riced cauliflower",
      "1 ripe avocado, diced (320 kcal)",
      "2 tbsp olive oil (240 kcal)",
      "1/2 cup white onion, chopped",
      "1 clove garlic, minced",
      "1 tsp cumin",
      "1 lime, zested and juiced",
      "1/4 tsp salt",
    ],
    steps: [
      "Microwave the riced cauliflower to package directions, about 5 to 6 minutes, then set it aside to steam off in its bowl.",
      "Heat 1 tablespoon of the olive oil in a medium nonstick pan over medium heat and cook the shrimp 2 to 3 minutes a side, until pink and opaque.",
      "Lift the shrimp into a small bowl and season them straight away with the cumin, lime zest and salt while they are still hot.",
      "Add the rest of the oil to the pan, soften the onion about 2 minutes, then stir in the garlic and avocado for one minute more.",
      "Blend that mixture smooth with the lime juice, return it to the pan with the cauliflower and stir over medium heat until it turns bright green.",
      "Divide between two bowls, top each with four shrimp, and eat right away — the avocado sauce dulls in colour as it stands.",
    ],
    tip: "Do not let the blended avocado boil or it turns grey and bitter — warm it through and no further. Squeeze in extra lime just before serving to hold the colour.",
  },
  {
    title: "Bell pepper and Vidalia onion strata",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/bell-pepper-and-vidalia-onion-strata-fresh-salsa", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "1 hr 10 min", servings: 4, kcal: 295,
    macros: { p: 20, c: 26, f: 13 },
    tags: ["Breakfast","Family","Comfort"],
    hero: "linear-gradient(135deg, #e8b04b 0%, #c0473a 55%, #1a1612 100%)",
    note: "A savoury bread-and-egg bake with peppers and fresh salsa.",
    ingredients: [
      "1 Vidalia onion, sliced",
      "1/2 red bell pepper, sliced",
      "1/2 green bell pepper, sliced",
      "1 tbsp olive oil",
      "4 large eggs (280 kcal)",
      "4 egg whites",
      "1/2 cup skim milk",
      "4 slices whole-grain bread, cubed (320 kcal)",
      "1/2 cup reduced-fat Italian cheese (200 kcal)",
      "10 cherry tomatoes",
      "1 garlic clove",
      "1/8 tsp ground black pepper",
    ],
    steps: [
      "Heat the oven to 350°F (175°C) with a rack in the centre, and warm the olive oil in a 10-inch non-stick skillet over medium.",
      "Sauté the onion and pepper slices 5 to 8 minutes, until tender and just starting to catch colour at the edges, then pull the pan off the heat.",
      "Beat the eggs, egg whites, milk and black pepper in a large bowl until the mixture is uniform and pale, with no streaks of white left.",
      "Spray an 8-inch baking pan, scatter the bread cubes over the base, sprinkle on the cheese, add the sautéed vegetables and pour the egg mixture over everything.",
      "Bake uncovered 45 minutes, until the centre is set and no longer wobbles when you nudge the pan — an egg dish is done at 160°F (71°C).",
      "While it bakes, dice the cherry tomatoes, garlic and reserved onion into a rough salsa, and spoon it over each portion just before serving.",
    ],
    tip: "Assemble it the night before and keep it covered in the fridge; the bread drinks up the custard and bakes more evenly. Add 5 minutes if it goes in cold.",
  },
  {
    title: "Crisp black bean and cheese quesadillas",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/black-bean-quesadillas", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "20 min", servings: 8, kcal: 214,
    macros: { p: 13, c: 21, f: 8 },
    tags: ["Quick","Budget","Family"],
    hero: "linear-gradient(135deg, #d9822b 0%, #7a3b1f 55%, #1a1612 100%)",
    note: "Crisp-edged tortillas, molten cheese, black beans inside.",
    ingredients: [
      "3/4 cup chunky salsa or pico de gallo",
      "15.5 oz black beans, rinsed",
      "2 cups shredded Jack cheese (720 kcal)",
      "2 tbsp fresh cilantro, chopped",
      "4 8-inch flour tortillas (580 kcal)",
      "1/2 tsp extra virgin olive oil",
    ],
    steps: [
      "Drain the salsa in a small-hole strainer and discard the liquid — a wet filling steams the tortilla instead of crisping it.",
      "Tip the drained tomato mixture into a medium bowl and fold through the black beans, cheese and cilantro until evenly combined.",
      "Spread about 1/2 cup of filling over half of each tortilla, keeping it clear of the edge, then fold the bare half over to close.",
      "Heat a large griddle or skillet over medium-high and brush with the olive oil until it shimmers but stops short of smoking.",
      "Cook the quesadillas about 5 minutes in total, flipping once, until both sides are deep golden and the cheese runs when pressed.",
      "Slide them onto a board, rest 1 minute so the filling sets, then cut each into wedges and serve with any salsa left over.",
    ],
    tip: "Draining the salsa is the whole trick — skip it and the tortilla goes limp. Reheat leftovers in a dry skillet, never the microwave.",
  },
  {
    title: "Sharp cheddar baked macaroni",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/classic-macaroni-and-cheese", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "50 min", servings: 8, kcal: 183,
    macros: { p: 11, c: 23, f: 5 },
    tags: ["Comfort","Family","Budget"],
    hero: "linear-gradient(135deg, #e6a832 0%, #a8541e 55%, #1a1612 100%)",
    note: "Evaporated milk and one egg make it creamy without a roux.",
    ingredients: [
      "2 cups dry macaroni (760 kcal)",
      "1/2 cup onion, chopped",
      "1/2 cup non-fat evaporated milk",
      "1 large egg, beaten",
      "1 1/4 cups low-fat cheddar, grated (440 kcal)",
      "1/4 tsp black pepper",
      "2 sprays cooking oil spray",
    ],
    steps: [
      "Boil the macaroni in unsalted water to package directions, drain it while still firm, and set aside — it finishes cooking in the oven.",
      "Heat the oven to 350°F (175°C) and coat a casserole dish with cooking spray so the browned cheese lifts away cleanly.",
      "Sauté the chopped onion in a lightly sprayed saucepan over medium about 3 minutes, until soft and translucent but not coloured.",
      "Tip the macaroni, onion, evaporated milk, beaten egg, pepper and cheddar into a bowl and stir until every piece is coated.",
      "Bake 25 minutes, until the top is golden and the edges bubble steadily — the egg is what sets the custard around the pasta.",
      "Let it stand 10 minutes before serving so the sauce thickens and the portions hold their shape on the spoon.",
    ],
    tip: "Undercook the pasta by a minute; it drinks up the custard in the oven. Leftovers reheat well with a splash of milk stirred through.",
  },
  {
    title: "Peppers stuffed with brown rice and beans",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/peppers-stuffed-rice-beans", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "1 hr 30 min", servings: 4, kcal: 439,
    macros: { p: 21, c: 73, f: 8 },
    tags: ["Fiber","Batch","GF"],
    hero: "linear-gradient(135deg, #d4453b 0%, #4e7d3a 55%, #1a1612 100%)",
    note: "Four peppers packed with brown rice, beans and cheddar.",
    ingredients: [
      "1 cup uncooked brown rice (680 kcal)",
      "15 oz black beans (350 kcal)",
      "6 bell peppers, any colour",
      "1 cup reduced-fat cheddar, grated (320 kcal)",
      "1 tomato, chopped",
      "1 cup salsa",
      "to taste salt",
    ],
    steps: [
      "Heat the oven to 400°F (200°C) and cook the brown rice to package directions until tender, roughly 40 minutes in a covered pan.",
      "Cut the tops from all six peppers and scoop out the seeds; chop two of them and keep the other four whole for filling.",
      "Drain and rinse the black beans, then fold them through the rice with the chopped peppers, tomato, salsa and a little salt.",
      "Spoon about 3 tablespoons of filling into each pepper, add 2 tablespoons of cheese, then repeat until the peppers are full.",
      "Bake the stuffed peppers 30 minutes, until the walls slump slightly and a knife slides into the side with no resistance.",
      "Crown each with the remaining cheese and bake 15 minutes more, until it has melted and blistered brown in spots at the edges.",
    ],
    tip: "Cook the rice a day ahead — cold rice packs tighter and the peppers hold their shape. Stand them in a snug dish so they cannot tip over.",
  },
  {
    title: "Swiss cheese and vegetable chowder",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/vegetable-cheese-soup", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "30 min", servings: 4, kcal: 218,
    macros: { p: 14, c: 30, f: 5 },
    tags: ["Soup","Quick","GF"],
    hero: "linear-gradient(135deg, #e3c25c 0%, #5f7a3a 55%, #1a1612 100%)",
    note: "A thick vegetable soup built on milk rather than cream.",
    ingredients: [
      "3 cups water, divided",
      "3 cups mixed vegetables, chopped",
      "1/4 cup onions, chopped",
      "1 cup non-fat dry milk (430 kcal)",
      "1 1/2 tbsp cornstarch",
      "1/2 cup Swiss cheese, diced (200 kcal)",
      "1/2 tsp curry powder",
      "1 tsp salt",
      "handful green onions, sliced",
    ],
    steps: [
      "Bring 2 cups of the water to a boil in a medium saucepan over high heat, then add the vegetables, onion, salt and curry powder.",
      "Reduce to a bare simmer, cover the pan, and cook 8 to 10 minutes, until the vegetables are almost tender but still hold their edges.",
      "Whisk the remaining 1 cup of water with the dry milk and cornstarch in a small bowl until completely smooth and free of lumps.",
      "Pour the slurry into the pan and cook over medium 3 to 4 minutes, stirring often, until the soup thickly coats the back of a spoon.",
      "Drop in the Swiss and stir off the heat until it melts smoothly — boiling now would split the cheese into stringy threads.",
      "Loosen with a splash more water if it thickens past pourable, then ladle out and scatter the sliced green onions over the top.",
    ],
    tip: "Add the cheese off the heat or it turns grainy. Frozen mixed vegetables work as well as fresh here and need no extra simmering time.",
  },
  {
    title: "Blueberry baked oats in ramekins",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/blueberry-baked-oats", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "40 min", servings: 4, kcal: 378,
    macros: { p: 18, c: 64, f: 6 },
    tags: ["Breakfast","Fiber","Meal prep"],
    hero: "linear-gradient(135deg, #5b6fa8 0%, #3d4b7a 55%, #1a1612 100%)",
    note: "Blended oats bake into a warm, spoonable breakfast pudding.",
    ingredients: [
      "2 eggs",
      "2 cups quick-cooking rolled oats (600 kcal)",
      "1 cup 1% milk",
      "1 tsp baking powder",
      "1/4 tsp salt",
      "2 large bananas (210 kcal)",
      "1 1/2 cups blueberries, divided",
      "2 tbsp honey",
      "1 tsp vanilla extract",
      "1 cup fat-free Greek yogurt (130 kcal)",
      "zest of 1 lemon",
    ],
    steps: [
      "Heat the oven to 350°F (175°C) and grease four 8-ounce ramekins right to the rim so the oats climb the sides cleanly.",
      "Blend the eggs, oats, milk, baking powder and salt on high until the mixture is puréed and pours like pancake batter.",
      "Add the bananas, 1 cup of the blueberries, honey and vanilla, then pulse until it thickens to a smoothie texture.",
      "Divide between the ramekins, filling each about three-quarters full, and dot the remaining blueberries over the tops.",
      "Set the ramekins on a baking sheet and bake 25 to 30 minutes, until puffed and golden at the edges with a firm centre.",
      "Cool 5 minutes so they settle, then top with the Greek yogurt and a scattering of lemon zest just before eating.",
    ],
    tip: "No ramekins? Bake it in one 8-inch dish and add 5 to 10 minutes. They keep three days in the fridge and reheat straight from cold.",
  },
  {
    title: "Layered cheddar potato gratin",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/au-gratin-potatoes", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "1 hr 20 min", servings: 8, kcal: 250,
    macros: { p: 12, c: 36, f: 7 },
    tags: ["Comfort","Family","Batch"],
    hero: "linear-gradient(135deg, #e0b566 0%, #8a5a2b 55%, #1a1612 100%)",
    note: "Thin potatoes layered with a smooth cheddar sauce.",
    ingredients: [
      "6 russet potatoes, sliced thin (1000 kcal)",
      "1 cup onion, chopped",
      "1 1/2 cups low-fat cheddar, grated (480 kcal)",
      "2 tbsp margarine (200 kcal)",
      "4 tbsp flour",
      "2 cups non-fat milk",
      "1/2 tsp salt",
      "dash black pepper",
    ],
    steps: [
      "Heat the oven to 350°F (175°C) and film a 9x13-inch casserole with oil so the crusted edges release once it is baked.",
      "Melt the margarine in a small pan over medium, stir in the flour, and cook 1 minute until it smells nutty rather than raw.",
      "Add the milk gradually, stirring constantly, and cook until the sauce thickens enough to coat a spoon, then take it off the heat.",
      "Stir the cheddar into the hot sauce until it melts smooth, season with the salt and pepper, and set it beside the dish.",
      "Layer a quarter of the potatoes and onion in the dish, spread over 1/2 cup of the sauce, and repeat to build four layers.",
      "Bake 1 hour, until the top is bronzed and a knife slides through the layers without resistance; rest 10 minutes before serving.",
    ],
    tip: "Slice the potatoes no thicker than a quarter inch or the middle stays chalky. Tent with foil if the top browns before the hour is up.",
  },
  {
    title: "Sheet-pan cauliflower and black bean bake",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/avocado-veggie-bake", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "35 min", servings: 8, kcal: 197,
    macros: { p: 10, c: 19, f: 10 },
    tags: ["Sheet-pan","Fiber","GF"],
    hero: "linear-gradient(135deg, #7fa84b 0%, #b7472a 55%, #1a1612 100%)",
    note: "Roasted veg, melted cheese and cool avocado piled on top.",
    ingredients: [
      "2 tbsp olive oil (240 kcal)",
      "1 tbsp chili powder",
      "1 tsp ground cumin",
      "1/2 tsp garlic powder",
      "1/4 tsp salt",
      "1/2 head cauliflower, in 2-inch pieces",
      "1 zucchini, sliced in rounds",
      "1 cup reduced-fat Mexican cheese (320 kcal)",
      "15 oz black beans, drained (350 kcal)",
      "1 cup canned corn, drained",
      "1 cup cherry tomatoes, halved",
      "1 ripe avocado, diced",
      "2 scallions, sliced",
      "1 jalapeño, seeded and sliced",
      "2 tbsp cilantro leaves",
    ],
    steps: [
      "Heat the oven to 425°F (220°C) and stir the olive oil with the chili powder, cumin, garlic powder and salt into a loose paste.",
      "Brush half the spiced oil across a 15x10-inch rimmed baking sheet so nothing sticks and the spices toast against the hot metal.",
      "Spread the cauliflower and zucchini in a single layer, brush with the rest of the oil, and roast 20 minutes until fork tender.",
      "Scatter the black beans, corn and cheese over the hot vegetables and return the sheet for 5 minutes, until the cheese has melted.",
      "Off the heat, top with the cherry tomatoes, avocado, scallions, jalapeño and cilantro so they stay bright against the roasted base.",
    ],
    tip: "Crowding the sheet steams the cauliflower instead of browning it — use two pans if you must. Add the avocado only once it is off the heat.",
  },
  {
    title: "Noodle-free potato and spinach lasagna",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/potato-spinach-lasagna", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "1 hr 10 min", servings: 4, kcal: 433,
    macros: { p: 20, c: 59, f: 14 },
    tags: ["Comfort","GF","Family"],
    hero: "linear-gradient(135deg, #c0392b 0%, #4f7a34 55%, #1a1612 100%)",
    note: "Thin potato slices stand in for the pasta sheets here.",
    ingredients: [
      "7 small red potatoes (700 kcal)",
      "1/2 cup onion, chopped",
      "2 cloves garlic, minced",
      "1 tbsp olive oil",
      "3 oz fresh baby spinach",
      "3/4 cup non-fat ricotta cheese (180 kcal)",
      "3/4 cup part-skim mozzarella (250 kcal)",
      "2 tbsp Parmesan cheese, grated",
      "1 egg, beaten",
      "1 1/2 cups no-salt-added pasta sauce",
    ],
    steps: [
      "Heat the oven to 375°F (190°C) and bring a large saucepan of water to a rolling boil for the potatoes.",
      "Slice the potatoes thin, boil them 5 minutes until just pliable, then drain and rinse under cool water to stop the cooking.",
      "Warm the olive oil in a medium skillet, sauté the onion and garlic 2 to 3 minutes until just starting to brown.",
      "Then wilt in the spinach for 1 minute and drain off the liquid.",
      "Beat the ricotta, mozzarella, Parmesan and egg together in a bowl until the mixture is smooth and holds its shape on a spoon.",
      "Build four layers in an 8-inch square dish — sauce, potato slices, spinach, cheese — using about a quarter of each per layer.",
      "Cover with foil and bake 35 to 40 minutes, until the sauce bubbles at the edges and a knife meets no resistance in the potatoes.",
      "Uncover and bake 10 minutes more, until the top cheese is melted and freckled brown; rest 10 minutes before cutting.",
    ],
    tip: "Par-boiling the potatoes is what keeps the centre from staying chalky. Let the dish rest before cutting or the layers slide apart.",
  },
  {
    title: "Charred corn and cornmeal patties",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/veggie-burgers", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "1 hr 30 min", servings: 6, kcal: 212,
    macros: { p: 6, c: 41, f: 4 },
    tags: ["Budget","Pantry","Family"],
    hero: "linear-gradient(135deg, #e8b23a 0%, #a85f24 55%, #1a1612 100%)",
    note: "Sweetcorn patties browned hard, then folded into a tortilla.",
    ingredients: [
      "15 oz whole kernel corn, chopped (230 kcal)",
      "1/2 cup cornmeal (220 kcal)",
      "1/2 cup onion, finely chopped",
      "1/2 cup green pepper, chopped",
      "1/2 cup cooked white rice",
      "1/4 tsp chili powder",
      "1 tsp jalapeno chilies, seeded",
      "1/4 tsp black pepper",
      "6 flour tortillas, 6-inch (540 kcal)",
    ],
    steps: [
      "Tip the chopped corn and cornmeal into a large bowl and stir until every kernel is dusted — the meal is what binds these, so take a full minute over it.",
      "Fold through the onion, green pepper, cooked rice, chili powder, black pepper and jalapeno, then shape six patties about 1/2 inch thick.",
      "Chill the patties on a tray in the fridge for a full hour. Skip this and they slump in the pan; cold cornmeal is what holds the edge.",
      "Heat a large pan over medium-high, mist both sides of the patties with cooking spray, and brown 5 to 8 minutes until a deep gold crust sets and they release cleanly.",
      "Slide the pan into a 350°F oven for 10 minutes to cook the middle through, adding the tortillas for the last 8 minutes until warm and pliable.",
      "Lay a patty on half of each tortilla and fold it over like a taco while the crust is still crisp and the shell still steams.",
    ],
    tip: "The hour in the fridge is not optional — a warm patty will crumble the moment you turn it. Formed patties keep raw and covered for two days.",
  },
  {
    title: "Sweet potato and kidney bean chili",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/vegetable-chili", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "1 hr", servings: 5, kcal: 435,
    macros: { p: 20, c: 77, f: 8 },
    tags: ["Fiber","Batch","Freezer"],
    hero: "linear-gradient(135deg, #c2411f 0%, #7a3410 55%, #1a1612 100%)",
    note: "Three cans of kidney beans, sweet potato and a heavy hand of chili.",
    ingredients: [
      "2 tbsp vegetable oil (240 kcal)",
      "2 yellow onions, chopped",
      "2 zucchinis, cubed",
      "2 sweet potatoes, cubed",
      "3 cloves garlic, minced",
      "2 tsp ground cumin",
      "2 tbsp chili powder",
      "2 tsp dried oregano",
      "3 cans dark red kidney beans (1140 kcal)",
      "2 cans diced tomatoes",
      "2 cups frozen corn (250 kcal)",
    ],
    steps: [
      "Set a heavy pot over medium heat and let it warm through before the oil goes in — it should shimmer and thin out within seconds of hitting the base.",
      "Add the onions, zucchini, sweet potato, garlic, cumin, chili powder and oregano and cook 20 minutes, stirring now and then, until the spices darken and coat everything.",
      "Tip in the kidney beans and both cans of tomatoes with their liquid, stir well and scrape any browned spice off the bottom of the pot.",
      "Cover and cook 30 minutes over low heat, until a knife slides through the sweet potato with no resistance and the chili has thickened around it.",
      "Stir the frozen corn through and cook a few minutes more, just until it is hot and still snapping — overcooked corn goes flat and mealy.",
    ],
    tip: "It is better on day two once the chili powder settles. Keeps five days chilled and freezes well in single portions.",
  },
  {
    title: "Lentil and pearl barley soup",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/lentil-barley-soup", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "1 hr 55 min", servings: 6, kcal: 330,
    macros: { p: 19, c: 64, f: 1 },
    tags: ["Fiber","Soup","Iron-rich"],
    hero: "linear-gradient(135deg, #8f6b2e 0%, #4e3a1c 55%, #1a1612 100%)",
    note: "Barley thickens it; a splash of vinegar at the end wakes it up.",
    ingredients: [
      "2 cups dried lentils, rinsed (1360 kcal)",
      "1/2 cup pearl barley (350 kcal)",
      "4 scallions, sliced",
      "5 carrots, chopped",
      "2 tsp dried oregano",
      "12 cups water",
      "14.5 oz whole peeled tomatoes",
      "1 tbsp red wine vinegar",
      "1/2 tsp salt",
    ],
    steps: [
      "Put the lentils, scallions, carrots, oregano, barley and water into a large soup pot and bring it up to a hard rolling boil over high heat.",
      "Drop the heat to low and simmer uncovered for one hour, until the lentils have collapsed and the barley has swollen to soft, glossy pearls.",
      "Chop the canned tomatoes coarsely, tip them in with their liquid, and cook another 45 minutes until the soup is thick enough to hold a spoon upright.",
      "Taste for salt, then stir the red wine vinegar in off the heat right before serving — it lifts the whole pot out of flatness.",
      "Ladle out and let it sit two minutes; barley soup straight off the boil scalds and hides its own flavour.",
    ],
    tip: "It sets almost solid in the fridge — loosen each portion with a splash of hot water when reheating. Add the vinegar fresh each time.",
  },
  {
    title: "Curried butternut and chickpea stew",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/curried-squash-stew", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "40 min", servings: 4, kcal: 240,
    macros: { p: 11, c: 42, f: 5 },
    tags: ["Fiber","One-pan","Comfort"],
    hero: "linear-gradient(135deg, #d98a1f 0%, #8a4a14 55%, #1a1612 100%)",
    note: "Curry powder bloomed in oil, then squash and chickpeas do the rest.",
    ingredients: [
      "1 tbsp vegetable oil (120 kcal)",
      "1 yellow onion, chopped",
      "2 cloves garlic, minced",
      "1 stalk celery with leaves",
      "1/2 tsp ground cinnamon",
      "1 large zucchini, chopped",
      "2 tbsp curry powder",
      "3 cups butternut squash, cubed (190 kcal)",
      "14.5 oz diced tomatoes",
      "15.5 oz chickpeas, rinsed (380 kcal)",
    ],
    steps: [
      "Warm a large pot over medium heat, add the oil, then the onion, garlic and celery. Cook about 10 minutes until the onion is translucent and slack, with no bite left.",
      "Stir in the zucchini, cinnamon and curry powder and cook 10 minutes more. The powder needs the hot oil to bloom — you will smell it turn from dusty to fragrant.",
      "Add the butternut squash, the tomatoes with all their liquid, and the drained chickpeas, then stir so the squash sits down in the liquid.",
      "Cover and cook about 10 minutes over medium heat, until a fork goes through the squash cleanly but the cubes still hold their shape.",
      "Take the lid off and let it stand five minutes before serving over brown rice; the stew tightens as it settles.",
    ],
    tip: "A half cup of raisins added with the squash is the USDA's own suggestion and it works — the sweetness balances two tablespoons of curry powder.",
  },
  {
    title: "Cold black bean and brown rice salad",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/black-bean-and-rice-salad", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "1 hr 15 min", servings: 4, kcal: 235,
    macros: { p: 8, c: 33, f: 8 },
    tags: ["Meal prep","Budget","GF"],
    hero: "linear-gradient(135deg, #4a6b3a 0%, #2e2a1e 55%, #1a1612 100%)",
    note: "Shake the dressing in a jar, chill an hour, eat it cold.",
    ingredients: [
      "15 oz black beans, rinsed (380 kcal)",
      "1 cup brown rice, cooked (215 kcal)",
      "1/2 cup onion, chopped",
      "1/2 cup bell pepper, chopped",
      "1/4 cup rice vinegar",
      "1/2 tsp mustard powder",
      "1 clove garlic, chopped",
      "1/2 tsp salt",
      "2 tbsp vegetable oil (240 kcal)",
    ],
    steps: [
      "Cook the brown rice ahead and spread it on a tray to cool completely — warm rice turns the dressing cloudy and the beans to mush.",
      "In a mixing bowl, stir the onion, bell pepper, cooled rice and drained black beans together until the beans are evenly distributed.",
      "Put the vinegar, mustard powder, garlic, salt, black pepper and oil in a jar with a tight lid and shake hard for 20 seconds until it thickens and turns opaque.",
      "Pour the dressing over the bean mixture and fold it through gently with a spatula so the beans stay whole rather than breaking down.",
      "Cover and chill at least one hour before serving cold — the rice needs that time to drink up the vinegar and season through.",
    ],
    tip: "It holds three days and improves on day two. If it tastes dull straight from the fridge, add a splash more vinegar rather than salt.",
  },
  {
    title: "Crispy skillet rice with tofu and peas",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/crusty-rice-tofu-and-vegetables", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "1 hr", servings: 4, kcal: 425,
    macros: { p: 19, c: 58, f: 15 },
    tags: ["Bowl","One-pan","Family"],
    hero: "linear-gradient(135deg, #d6c07a 0%, #6e5a2a 55%, #1a1612 100%)",
    note: "Pressed into the pan until the base turns to golden crust.",
    ingredients: [
      "1 cup brown rice, uncooked (680 kcal)",
      "2 cups water",
      "1 lb tofu, cubed (330 kcal)",
      "1 cup frozen corn",
      "1 cup frozen peas",
      "6 scallions, sliced",
      "1 carrot, shredded",
      "1/4 cup fresh basil leaves",
      "1/4 tsp salt",
      "2 tbsp vegetable oil (240 kcal)",
    ],
    steps: [
      "Cook the brown rice in the water per the packet, then spread it out and leave it to cool and dry — wet rice steams instead of crisping.",
      "In a large bowl mix the tofu, frozen corn, frozen peas, scallions, shredded carrot, basil and salt until the tofu is coated in green.",
      "When the rice is fully cold, fold it into the tofu mixture, breaking up any clumps so everything sits in an even loose layer.",
      "Set a skillet over medium-high, add the oil, tip in the mixture and press it flat with a spatula. Drop the heat to low, cover and cook 10 minutes.",
      "Press down again, then flip sections of rice in chunks and keep cooking up to 20 minutes until the base is deep gold and audibly crisp at the edges.",
    ],
    tip: "Day-old fridge-cold rice crisps far better than same-day rice. If it sticks, leave it alone another minute — the crust releases itself when it is ready.",
  },
  {
    title: "Smoky lentil taco filling",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/lentil-tacos", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "45 min", servings: 6, kcal: 193,
    macros: { p: 14, c: 35, f: 1 },
    tags: ["Fiber","Batch","Iron-rich"],
    hero: "linear-gradient(135deg, #a34a2a 0%, #5c2f18 55%, #1a1612 100%)",
    note: "Lentils cooked down with tomato paste until they hold a spoon.",
    ingredients: [
      "1 1/2 cups dry lentils, rinsed (1020 kcal)",
      "4 cups water",
      "1/2 green pepper, chopped",
      "4 cloves garlic, minced",
      "1 tsp chili powder",
      "1 tsp ground cumin",
      "1/2 tsp dried basil",
      "1/2 tsp hot pepper flakes",
      "2/3 cup tomato paste (140 kcal)",
    ],
    steps: [
      "Bring the lentils and 3 cups of the water to a boil in a saucepan, then cook 10 minutes at a steady simmer until they just begin to soften at the edges.",
      "Stir in the green pepper, garlic, chili powder, cumin, basil, pepper flakes and tomato paste, breaking the paste up so it dissolves rather than sitting in lumps.",
      "Simmer 30 minutes uncovered, stirring occasionally, until the lentils collapse and a spoon dragged across the pan leaves a trail that holds.",
      "Add the reserved water a splash at a time if it tightens too far — you want a thick scoopable filling, not a dry paste that falls out of the shell.",
      "Warm corn tortillas in a dry pan 30 seconds a side until they blister and go flexible, then spoon the hot filling straight in.",
    ],
    tip: "A quarter cup of raisins stirred in with the spices is the USDA original's optional add and it cuts the chili powder nicely. The filling freezes flat in bags.",
  },
  {
    title: "Skillet chickpeas with wilted spinach",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/chickpeas-and-spinach-saute", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "35 min", servings: 4, kcal: 193,
    macros: { p: 10, c: 27, f: 7 },
    tags: ["One-pan","Quick","Fiber"],
    hero: "linear-gradient(135deg, #6d8a3c 0%, #3f4a20 55%, #1a1612 100%)",
    note: "Chickpeas, tomatoes and a whole box of spinach in one pan.",
    ingredients: [
      "1 tbsp vegetable oil (120 kcal)",
      "1 yellow onion, chopped",
      "1 clove garlic, minced",
      "1 stalk celery, chopped",
      "1 carrot, chopped",
      "14.5 oz diced tomatoes",
      "16 oz chickpeas, rinsed (380 kcal)",
      "1/4 cup water",
      "10 oz frozen spinach",
      "1 tsp fresh lemon juice",
      "1/4 tsp crushed red pepper",
    ],
    steps: [
      "Set a wide skillet over medium-high heat and add the oil once the pan is hot enough that a drop of water skitters across it.",
      "Cook the onion, garlic, celery and carrot for about 15 minutes until the vegetables slump and the onion edges take on real brown colour.",
      "Raise the heat to high, add the tomatoes with their liquid, the drained chickpeas and the water, and cook 5 minutes until it bubbles hard.",
      "Drop the heat low, pile the frozen spinach on top without stirring, cover, and leave 10 minutes until it has thawed and steamed through.",
      "Stir the spinach down into the chickpeas, then finish with the lemon juice and red pepper flakes and serve over brown rice or quinoa.",
    ],
    tip: "Leaving the spinach untouched on top lets it steam instead of stewing, so it stays green. Kale works the same way but wants five minutes longer.",
  },
  {
    title: "Sheet-pan roasted vegetables, lemon and herbs",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/oven-roasted-vegetables", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "35 min", servings: 6, kcal: 101,
    macros: { p: 3, c: 12, f: 5 },
    tags: ["Sheet-pan","Side","Budget"],
    hero: "linear-gradient(135deg, #d98324 0%, #8a5a2b 55%, #1a1612 100%)",
    note: "A hot tray, one layer, and edges that go properly brown.",
    ingredients: [
      "3 cups mixed fresh vegetables, cut up (350 kcal)",
      "2 tbsp vegetable oil (240 kcal)",
      "1 tbsp lemon juice",
      "1/2 tsp Italian seasoning",
      "1/4 tsp salt",
      "1/4 tsp black pepper, ground",
    ],
    steps: [
      "Heat the oven to 450°F (230°C) and slide a rimmed baking sheet onto the middle rack while it comes up to temperature.",
      "Whisk the oil, lemon juice, Italian seasoning, salt and pepper in a small bowl until the mixture turns cloudy and clings to the whisk.",
      "Wash, peel and cut the vegetables into even 1-inch pieces, so nothing scorches while the thicker chunks are still raw in the middle.",
      "Tip the vegetables onto the hot sheet, pour over the oil mixture and spread them in one layer — crowd the tray and they steam pale instead of caramelising.",
      "Roast 20 minutes, stirring once at the 10-minute mark, until the edges go deep brown and a knife tip slides into the thickest piece without resistance.",
      "Serve straight from the tray while still hot; those crisp edges soften within minutes of sitting.",
    ],
    tip: "Group vegetables by density — potatoes and carrots on one tray, broccoli and peppers on another — or the quick ones burn while the roots finish. Leftovers reheat best in a dry pan, never the microwave.",
  },
  {
    title: "Bell pepper and apple slaw, cider dressing",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/bell-pepper-and-apple-coleslaw", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "20 min", servings: 4, kcal: 186,
    macros: { p: 5, c: 26, f: 8 },
    tags: ["No-cook","Salad","Quick"],
    hero: "linear-gradient(135deg, #9bbf5a 0%, #c94f3d 55%, #1a1612 100%)",
    note: "Crunchy, sweet-sharp, and no mayonnaise anywhere near it.",
    ingredients: [
      "1 small head green or Napa cabbage (180 kcal)",
      "1/4 cup sliced almonds (130 kcal)",
      "1 tbsp vegetable oil (120 kcal)",
      "1 Gala or Fuji apple",
      "1 orange or red bell pepper",
      "1/4 cup apple juice",
      "2 tbsp cider vinegar",
      "2 tsp Dijon mustard",
      "1/4 tsp salt",
      "1 dash black pepper",
    ],
    steps: [
      "Whisk the oil, apple juice, cider vinegar, Dijon, salt and pepper in a small bowl until the dressing thickens and stops separating.",
      "Shred or thinly slice the cabbage into fine ribbons — the thinner the cut, the faster it softens once the dressing hits it.",
      "Cut the apple and bell pepper into small chunks about the size of your thumbnail and add them to a large bowl with the cabbage and almonds.",
      "Drizzle over the dressing and toss for a full minute, until every ribbon glistens and the pile visibly collapses by about a third.",
      "Chill 20 minutes in the covered bowl before serving, so the cabbage turns tender-crisp and the vinegar loses its raw edge.",
    ],
    tip: "Dress it no more than an hour ahead — past that the cabbage weeps and the almonds go soft. Toss the apple in a little of the dressing first if you are prepping early; the acid keeps it from browning.",
  },
  {
    title: "Spring cabbage and artichoke soup",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/spring-vegetable-soup", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "30 min", servings: 4, kcal: 137,
    macros: { p: 5, c: 21, f: 4 },
    tags: ["Soup","Fiber","Quick"],
    hero: "linear-gradient(135deg, #a83f5b 0%, #c4622d 55%, #1a1612 100%)",
    note: "A bright, brothy pot that comes together in half an hour.",
    ingredients: [
      "2 1/2 cups low-sodium vegetable juice (125 kcal)",
      "1 cup green peas, frozen or fresh (120 kcal)",
      "1 tbsp extra virgin olive oil (120 kcal)",
      "1/4 head red cabbage, finely shredded",
      "2 medium ripe tomatoes, chopped",
      "1/2 cup canned artichoke hearts",
      "1 cup water",
      "2 tsp dried basil",
    ],
    steps: [
      "Heat the olive oil in a large soup pot over medium heat until it shimmers and runs thin across the base of the pan.",
      "Add the shredded cabbage, tomatoes, artichoke hearts and peas and sauté 10 minutes, until the cabbage wilts down and turns glossy.",
      "Pour in the vegetable juice and water, raise the heat and bring the pot to a full rolling boil, scraping anything stuck off the bottom.",
      "Drop the heat to low, stir in the basil and simmer 10 minutes, until every vegetable yields easily to a spoon and the soup steams heavily.",
      "Ladle into bowls and season to taste — vegetable juice is already salty, so taste before you reach for the salt at all.",
    ],
    tip: "Keeps three days in the fridge and the flavour deepens overnight. Don't freeze it: the cabbage turns to thread and the peas go grey.",
  },
  {
    title: "Barley pilaf with mushrooms and celery",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/barley-pilaf", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "1 hr 15 min", servings: 8, kcal: 148,
    macros: { p: 3, c: 30, f: 2 },
    tags: ["Fiber","Batch","Budget"],
    hero: "linear-gradient(135deg, #c2a878 0%, #6b5537 55%, #1a1612 100%)",
    note: "Chewy, savoury grains that cost pennies a bowl.",
    ingredients: [
      "1 cup pearl barley, uncooked (700 kcal)",
      "1 tbsp vegetable oil (120 kcal)",
      "1 cup onion, chopped (65 kcal)",
      "1/2 cup celery, chopped",
      "1/2 cup bell pepper, chopped",
      "1 cup mushrooms, sliced",
      "1 tsp vegetable bouillon",
      "2 1/2 cups water",
    ],
    steps: [
      "Warm the oil in a medium pan over medium heat, then add the onion and celery and cook about 5 minutes, until soft and translucent.",
      "Stir in the bell pepper, mushrooms and pearl barley and toast 2 minutes, until the grains smell nutty and the mushrooms give up their liquid.",
      "Pour in the water and bouillon, stirring until the bouillon dissolves completely and no granules cling to the base of the pan.",
      "Bring to a boil, then lower the heat and cover the pan tightly, so the steam stays trapped and the barley swells evenly.",
      "Cook 50 to 60 minutes, until the barley is tender with a slight chew left and all the liquid has been absorbed.",
      "Rest off the heat 5 minutes with the lid on, then fluff with a fork to separate the grains before serving.",
    ],
    tip: "Doubles cleanly and reheats all week with a splash of water. Pearl barley is not gluten-free — swap in brown rice and cut the simmer to 45 minutes if you need it to be.",
  },
  {
    title: "Maple banana oatmeal with walnuts",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/banana-walnut-oatmeal", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "15 min", servings: 4, kcal: 304,
    macros: { p: 10, c: 55, f: 5 },
    tags: ["Breakfast","Fiber","Quick"],
    hero: "linear-gradient(135deg, #e3c98f 0%, #a5763f 55%, #1a1612 100%)",
    note: "Creamy oats sweetened by the fruit, not the syrup.",
    ingredients: [
      "2 cups quick cooking oats (600 kcal)",
      "2 ripe bananas, mashed (210 kcal)",
      "2/3 cup non-fat dry milk (160 kcal)",
      "2 3/4 cups water",
      "2 tbsp 100% maple syrup",
      "2 tbsp walnuts, chopped",
      "1 dash salt",
    ],
    steps: [
      "Combine the reconstituted dry milk, the salt and the extra water in a small saucepan set over medium heat.",
      "Warm it until the surface steams and the edges tremble but never breaks into a boil — boiled milk catches on the base and tastes scorched.",
      "Stir in the oats and cook 1 to 2 minutes, stirring the whole time, until the mixture thickens enough to coat the back of the spoon.",
      "Pull the pan off the heat and fold in the mashed banana and maple syrup, both of which turn flat and bitter if they keep cooking.",
      "Divide between four bowls, scatter the chopped walnuts over the top and serve while it is still loose and steaming.",
    ],
    tip: "It sets firm in the fridge — loosen next-day portions with a splash of milk before reheating. Toast the walnuts in a dry pan for two minutes first if you have the patience; it doubles the flavour.",
  },
  {
    title: "Papaya banana batido",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/batido-smoothie", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "10 min", servings: 4, kcal: 135,
    macros: { p: 4, c: 28, f: 1 },
    tags: ["Breakfast","No-cook","Quick"],
    hero: "linear-gradient(135deg, #f2994a 0%, #e8c86a 55%, #1a1612 100%)",
    note: "Four ingredients, one minute, tropical and cold.",
    ingredients: [
      "2 overripe bananas, sliced (210 kcal)",
      "1 cup plain low-fat yogurt (155 kcal)",
      "2 cups papaya chunks (110 kcal)",
      "1 cup ice cubes",
    ],
    steps: [
      "Drop the papaya chunks, sliced bananas, yogurt and ice cubes into the blender jar in that order, softest fruit first.",
      "Seat the lid firmly before you touch the switch — a full jar of ice will lift a loose lid and throw the batido up the wall.",
      "Blend on a medium setting for about 1 minute, until the ice stops rattling and the mixture turns completely smooth and pale.",
      "Check the texture: it should pour thickly and hold a soft ripple, with no flecks of unblended fruit left in it.",
      "Pour into cold glasses and serve right away, or cover and refrigerate up to 4 hours before drinking.",
    ],
    tip: "Freeze the banana slices ahead and drop the ice to half a cup — you get the same chill without watering the flavour down. It separates as it stands, so stir before pouring.",
  },
  {
    title: "Acorn squash stuffed with cinnamon apples",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/apple-stuffed-squash", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "20 min", servings: 8, kcal: 116,
    macros: { p: 2, c: 25, f: 2 },
    tags: ["Side","Fiber","GF"],
    hero: "linear-gradient(135deg, #5f7a3a 0%, #c8842e 55%, #1a1612 100%)",
    note: "Autumn on a plate, done entirely in the microwave.",
    ingredients: [
      "4 acorn squashes, washed (690 kcal)",
      "2 apples, chopped (190 kcal)",
      "1 tbsp butter (100 kcal)",
      "2 tsp brown sugar, packed",
      "1/2 tsp cinnamon",
    ],
    steps: [
      "Cut each squash in half through the stem and scrape out the seeds and stringy fibres with a sturdy metal spoon.",
      "Lay the halves in a glass dish, cover with plastic wrap and microwave on high 5 minutes, until the flesh gives slightly under a thumb.",
      "Melt the butter in a separate bowl, then stir in the chopped apples, brown sugar and cinnamon until every piece is coated and glossy.",
      "Microwave the apple mixture 1 1/2 minutes, just until the fruit softens at the edges but still holds its shape.",
      "Spoon the filling into each squash half, cover and microwave 3 to 5 minutes more, until a knife tip slides through the squash wall with no resistance.",
      "Serve warm straight from the dish, spooning the buttery juices from the base back over the top.",
    ],
    tip: "Pierce the skins before the first microwave burst or a trapped steam pocket will split a half open. It also works at 375°F for 45 minutes if you want the edges to caramelise.",
  },
  {
    title: "Lemon garlic chickpea dip",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/chickpea-dip", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "10 min", servings: 4, kcal: 120,
    macros: { p: 6, c: 17, f: 3 },
    tags: ["Snack","No-cook","Fiber"],
    hero: "linear-gradient(135deg, #ddc9a0 0%, #c46a33 55%, #1a1612 100%)",
    note: "Smoother than shop-bought and made in one blitz.",
    ingredients: [
      "15 oz chickpeas, low-sodium (380 kcal)",
      "1 tsp olive oil (40 kcal)",
      "1/4 cup plain fat-free yogurt (35 kcal)",
      "3 garlic cloves",
      "1 tbsp fresh lemon juice",
      "1/4 tsp salt",
      "1/4 tsp paprika",
      "1/8 tsp black pepper",
    ],
    steps: [
      "Drain and rinse the chickpeas thoroughly, until the water runs clear and none of the tinny canning liquid is left.",
      "Add the chickpeas, garlic, yogurt, lemon juice, olive oil, salt, paprika and pepper to the bowl of a food processor.",
      "Blend 60 to 90 seconds, scraping the sides down once, until the dip goes completely smooth with no grainy skins left in it.",
      "Check the texture — it should fall off the spoon in a thick ribbon; loosen it with a spoonful of cold water if it drags.",
      "Serve at room temperature with carrot sticks, pita chips or crackers, and get any leftovers into the fridge within two hours.",
    ],
    tip: "The garlic sharpens overnight, so go easy if you are making it a day ahead. A pinch more paprika and a thread of oil on top before serving makes it look like you tried harder than you did.",
  },
  {
    title: "Beets, beans and greens salad",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/beets-beans-and-greens", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "20 min", servings: 6, kcal: 168,
    macros: { p: 8, c: 24, f: 5 },
    tags: ["Salad","Fiber","GF"],
    hero: "linear-gradient(135deg, #8e2f52 0%, #6f8f3f 55%, #1a1612 100%)",
    note: "Earthy beets, soft beans, sharp mustard dressing.",
    ingredients: [
      "2 cups cooked beans, rinsed (480 kcal)",
      "2 tbsp vegetable oil (240 kcal)",
      "2 cups sliced cooked beets (150 kcal)",
      "1 head lettuce, washed and torn",
      "1/4 cup lemon juice",
      "1 garlic clove, finely chopped",
      "2 tsp mustard",
      "1 pinch salt and pepper",
    ],
    steps: [
      "Whisk the lemon juice, garlic, mustard, oil, salt and pepper together in a large bowl until the dressing turns cloudy and thick.",
      "Toss the sliced beets with 1 tablespoon of the dressing in a small separate bowl, so they don't bleed pink through the whole salad.",
      "Tear the washed lettuce into bite-size pieces and add it to the large bowl along with the rinsed beans.",
      "Toss the greens and beans with the remaining dressing for about 30 seconds, until every leaf is lightly slicked but not collapsed.",
      "Pile onto plates, spoon the dressed beets over the top and serve within 10 minutes, before the leaves start to wilt.",
    ],
    tip: "Any bean works — kidney, cannellini, chickpea — so use whatever tin is open. Dress the leaves at the very last moment; beet juice and lemon will wilt them flat in a quarter of an hour.",
  },
];

// Authored first so the existing order never shifts.
const SHAPE_RECIPES = [...RECIPES_BY_WEEKDAY, ...RECIPES_EXTRA, ...RECIPES_USDA];

// URL-safe slug from a recipe title, e.g. "Sheet-pan salmon, sweet potato &
// broccoli" -> "sheet-pan-salmon-sweet-potato-and-broccoli". Used for the
// per-recipe pages at /recipes/<slug>.
function recipeSlug(r) {
  return String((r && r.title) || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function findRecipeBySlug(slug) {
  if (!slug) return null;
  return SHAPE_RECIPES.find(r => recipeSlug(r) === slug) || null;
}

// Saved recipe library — persisted as an array of slugs in localStorage so a
// member's saved recipes survive across the site (and the mobile app, same
// origin).
const SAVED_RECIPES_KEY = "shape.savedRecipes.v1";
function getSavedRecipeSlugs() {
  try {
    const raw = window.localStorage.getItem(SAVED_RECIPES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}
function isRecipeSaved(slug) {
  return getSavedRecipeSlugs().indexOf(slug) >= 0;
}
function toggleSavedRecipe(slug) {
  let slugs = getSavedRecipeSlugs();
  if (slugs.indexOf(slug) >= 0) slugs = slugs.filter(s => s !== slug);
  else slugs = [slug, ...slugs];
  try { window.localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(slugs)); } catch (e) {}
  return slugs.indexOf(slug) >= 0;
}

// Dietary-needs axis (multi-match) layered on top of the single `diet`.
// Objective needs are derived from macros/diet; gluten/dairy/mediterranean use
// small curated title sets (more accurate than parsing free-text ingredients).
// Four filter groups:
//   Diet (eating pattern/identity) + Protein (primary source) — one shared
//   single-select axis; Free From (allergens) + Goals (macro targets) — a
//   multi-select layer (recipeNeeds).
const RECIPE_DIETS = ["Vegan", "Vegetarian", "Pescatarian", "Mediterranean"];
const RECIPE_PROTEINS = ["Seafood", "Poultry", "Meat"];
const RECIPE_FREE_FROM = ["Gluten-free", "Dairy-free"];
const RECIPE_GOALS = ["High-protein", "Low-carb"];
const _RECIPE_NOT_GF = new Set([
  "Tempo turkey lettuce cups", "Miso-glazed cod with greens", "Tofu and edamame poke bowl", "Grilled chicken Caesar, lightened", "Beef and broccoli stir-fry", "Tempeh and broccoli teriyaki", "Turkey meatballs in marinara", "Smoked salmon and avocado toast", "Greek yogurt power bowl", "Chicken pesto pasta", "Garlic shrimp linguine", "Lentil bolognese", "Creamy tomato and white bean pasta", "Beef ragu rigatoni", "Crispy tofu grain bowl", "Overnight oats, three ways", "Harissa salmon with couscous", "Cottage cheese protein toast",
  // Oats are not gluten-free unless certified. "Date and almond energy bites"
  // (rolled oats) and "Maple banana oatmeal with walnuts" (quick-cooking oats)
  // were advertised as safe while "Overnight oats" above was not — one ingredient,
  // two answers. Mirrors _RECIPE_NOT_GF + USDA_NOT_GF in the catalog module.
  "Date and almond energy bites", "Maple banana oatmeal with walnuts",
  // The 50 USDA MyPlate records carry their own classifications; these mirror
  // USDA_NOT_GF in mobile-app/src/broadsheet/shapeKitchenData.usda.js. A title
  // ABSENT from this set is asserted gluten-free by recipeNeeds below, so an
  // omission here is a false allergen claim, not a missing tag.
  "Beef stroganoff with macaroni", "Ground beef and root vegetable stew", "Mango and peanut chicken wraps", "Asparagus and mandarin chicken rice bowl", "Turkey tetrazzini bake", "Sizzling chicken and broccoli over brown rice", "Chargrilled tilapia tacos with peach salsa", "Neapolitan tuna fettuccine with capers", "Bell pepper and Vidalia onion strata", "Crisp black bean and cheese quesadillas", "Sharp cheddar baked macaroni", "Blueberry baked oats in ramekins", "Layered cheddar potato gratin", "Charred corn and cornmeal patties", "Lentil and pearl barley soup", "Barley pilaf with mushrooms and celery",
]);
const _RECIPE_HAS_DAIRY = new Set([
  "Greek yogurt power bowl", "Shrimp and quinoa harvest bowl", "Chickpea shakshuka", "Grilled chicken Caesar, lightened", "Roasted veg and halloumi traybake", "Turkey meatballs in marinara", "Chicken pesto pasta", "Creamy tomato and white bean pasta", "Beef ragu rigatoni", "Overnight oats, three ways", "Garlic shrimp and courgette noodles", "Cottage cheese protein toast",
  // Mirrors USDA_HAS_DAIRY in shapeKitchenData.usda.js — see the note above:
  // absence from this set is an active dairy-free claim.
  "Beef stroganoff with macaroni", "Mango and peanut chicken wraps", "Turkey tetrazzini bake", "Bell pepper and Vidalia onion strata", "Crisp black bean and cheese quesadillas", "Sharp cheddar baked macaroni", "Peppers stuffed with brown rice and beans", "Swiss cheese and vegetable chowder", "Blueberry baked oats in ramekins", "Layered cheddar potato gratin", "Sheet-pan cauliflower and black bean bake", "Noodle-free potato and spinach lasagna", "Maple banana oatmeal with walnuts", "Papaya banana batido", "Acorn squash stuffed with cinnamon apples", "Lemon garlic chickpea dip",
]);
const _RECIPE_MED = new Set([
  "Sheet-pan salmon, sweet potato and broccoli", "Shrimp and quinoa harvest bowl", "Chickpea shakshuka", "Tuna niçoise bowl", "Roasted veg and halloumi traybake", "Harissa salmon with couscous", "Lemon-herb chicken meal-prep box",
  // Mirrors USDA_MED in shapeKitchenData.usda.js.
  "Grilled skirt steak with salsa criolla", "Tuna and chickpea antipasti salad", "Neapolitan tuna fettuccine with capers", "Bell pepper and Vidalia onion strata", "Noodle-free potato and spinach lasagna", "Lentil and pearl barley soup", "Skillet chickpeas with wilted spinach", "Sheet-pan roasted vegetables, lemon and herbs", "Spring cabbage and artichoke soup", "Lemon garlic chickpea dip", "Beets, beans and greens salad",
]);
// Free From + Goals membership (the multi-select layer).
function recipeNeeds(r) {
  const out = [];
  const p = (r.macros && r.macros.p) || 0;
  const c = (r.macros && r.macros.c) || 0;
  if (p >= 30) out.push("High-protein");
  if (c <= 40) out.push("Low-carb");
  if (!_RECIPE_NOT_GF.has(r.title)) out.push("Gluten-free");
  if (!_RECIPE_HAS_DAIRY.has(r.title)) out.push("Dairy-free");
  return out;
}
// Single-select Diet/Protein axis. Pescatarian = no meat/poultry; Mediterranean
// = curated set; everything else matches the recipe's base diet value.
function recipeMatchesDiet(r, diet) {
  if (!diet || diet === "All") return true;
  if (diet === "Pescatarian") return r.diet !== "Meat" && r.diet !== "Poultry";
  if (diet === "Mediterranean") return _RECIPE_MED.has(r.title);
  return r.diet === diet;
}

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

// Modal with full recipe — ingredients + steps + pro tip. Closed by clicking
// the backdrop, the × button, or pressing Escape.
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
            {(() => {
              const a = recipeAttribution(recipe);
              if (!a) return "RECIPE";
              if (a.kind === "authored") return `${(a.role || "RECIPE").toUpperCase()} · ${a.name.toUpperCase()}`;
              // Public domain: credit the source, and make it reachable.
              return a.url
                ? <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>{a.name.toUpperCase()}</a>
                : a.name.toUpperCase();
            })()}
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
              {(() => {
                const a = recipeAttribution(recipe);
                if (!a) return `"${recipe.note}"`;
                return a.kind === "authored"
                  ? `"${recipe.note}" — ${a.name}${a.role ? `, ${a.role}` : ""}`
                  : `"${recipe.note}" — ${a.name}`;
              })()}
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
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>METHOD</div>
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
          {recipe.tip && (
            <div style={{ marginTop: 22, padding: "14px 16px", borderRadius: 10, background: "rgba(46,224,196,0.08)", border: "1px solid rgba(46,224,196,0.25)" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: TEAL_BRIGHT, marginBottom: 6 }}>PRO TIP</div>
              <div style={{ fontSize: 13.5, color: "rgba(242,237,228,0.88)", lineHeight: 1.5 }}>{recipe.tip}</div>
            </div>
          )}
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
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 6 }}>{(() => {
          const a = recipeAttribution(r);
          if (!a) return "RECIPE";
          return a.kind === "authored"
            ? `FROM ${a.name.toUpperCase()}${a.role ? ` · ${a.role.toUpperCase()}` : ""}`
            : `FROM ${a.name.toUpperCase()}`;
        })()}</div>
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
  window.recipeSlug = recipeSlug;
  window.findRecipeBySlug = findRecipeBySlug;
  window.getSavedRecipeSlugs = getSavedRecipeSlugs;
  window.isRecipeSaved = isRecipeSaved;
  window.toggleSavedRecipe = toggleSavedRecipe;
  window.RECIPE_DIETS = RECIPE_DIETS;
  window.RECIPE_PROTEINS = RECIPE_PROTEINS;
  window.RECIPE_FREE_FROM = RECIPE_FREE_FROM;
  window.RECIPE_GOALS = RECIPE_GOALS;
  window.recipeAttribution = recipeAttribution;
  window.recipeNeeds = recipeNeeds;
  window.recipeMatchesDiet = recipeMatchesDiet;
}
