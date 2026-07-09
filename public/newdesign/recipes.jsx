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
      "Nestle the chicken back in, skin-side up, cover tightly, and cook on low for 18 minutes without lifting the lid.",
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
    tags: ["Low carb","Quick","GF"],
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
    tags: ["Seafood","Low carb","GF"],
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
      "Add the broccoli with a splash of water, cover, and steam-fry 3 minutes; add the garlic and ginger for the last 30 seconds.",
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
      "Add the garlic and ginger for 30 seconds, then pour in the teriyaki and toss for 2 minutes until it reduces to a sticky glaze.",
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
      "In the same water, boil the halved baby potatoes 10 minutes until tender, adding the green beans for the final 2 minutes, then drain.",
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
      "Roll into 1.5-inch balls with damp hands so the mix doesn't stick to your palms.",
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
      "Add the shrimp and cook 2 minutes, then pour in the wine and a squeeze of lemon and let it bubble for 1 minute.",
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
      "Add the garlic and ginger for 1 minute, then the curry powder for 30 seconds, stirring constantly so the spices toast in the oil without catching.",
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
      "Add the onion and green pepper and cook 5 minutes until softened, then the garlic, cumin and oregano for 1 minute until the pot smells toasty.",
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
const SHAPE_RECIPES = [...RECIPES_BY_WEEKDAY, ...RECIPES_EXTRA];

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
]);
const _RECIPE_HAS_DAIRY = new Set([
  "Greek yogurt power bowl", "Shrimp and quinoa harvest bowl", "Chickpea shakshuka", "Grilled chicken Caesar, lightened", "Roasted veg and halloumi traybake", "Turkey meatballs in marinara", "Chicken pesto pasta", "Creamy tomato and white bean pasta", "Beef ragu rigatoni", "Overnight oats, three ways", "Garlic shrimp and courgette noodles", "Cottage cheese protein toast",
]);
const _RECIPE_MED = new Set([
  "Sheet-pan salmon, sweet potato and broccoli", "Shrimp and quinoa harvest bowl", "Chickpea shakshuka", "Tuna niçoise bowl", "Roasted veg and halloumi traybake", "Harissa salmon with couscous", "Lemon-herb chicken meal-prep box",
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
  window.recipeSlug = recipeSlug;
  window.findRecipeBySlug = findRecipeBySlug;
  window.getSavedRecipeSlugs = getSavedRecipeSlugs;
  window.isRecipeSaved = isRecipeSaved;
  window.toggleSavedRecipe = toggleSavedRecipe;
  window.RECIPE_DIETS = RECIPE_DIETS;
  window.RECIPE_PROTEINS = RECIPE_PROTEINS;
  window.RECIPE_FREE_FROM = RECIPE_FREE_FROM;
  window.RECIPE_GOALS = RECIPE_GOALS;
  window.recipeNeeds = recipeNeeds;
  window.recipeMatchesDiet = recipeMatchesDiet;
}
