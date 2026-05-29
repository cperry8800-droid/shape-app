// Recipe primitives + dataset.
// Loaded by ClientDashboard.html (Today widget), ClientLibrary.html and the
// public Recipes.html page. PAPER / INK / TEAL / TEAL_BRIGHT + sans/serif come
// from pageShell.jsx, which must be loaded first.
//
// Each recipe carries:
//   by      — author name
//   byRole  — "Nutritionist" | "Dietician" | "Chef"
//   diet    — "Vegan" | "Vegetarian" | "Plant-based" | "Seafood" | "Poultry" | "Meat"
//   steps   — detailed, numbered cooking instructions
//   tip     — a short "chef's tip" surfaced in the modal
// so the Recipes page can filter by creator type and by diet category.

// One mock recipe per weekday. Index 0 = Sunday to match Date#getDay().
const RECIPES_BY_WEEKDAY = [
  {
    title: "One-pan chicken and rice",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Poultry",
    time: "30 min", servings: 1, kcal: 640,
    macros: { p: 48, c: 72, f: 18 },
    tags: ["High protein", "Pantry", "30 min"],
    hero: "linear-gradient(135deg, #e8b06a 0%, #b46a3c 60%, #1a1612 100%)",
    note: "Sunday reset — easy to scale up for meal prep.",
    ingredients: ["6 oz chicken thigh", "3/4 cup jasmine rice", "1 cup low-sodium broth", "Garlic, paprika, salt", "Frozen peas, handful"],
    steps: [
      "Pat the chicken thigh completely dry and season both sides with salt and paprika — dry skin is what lets it brown instead of steam.",
      "Heat 1 tsp oil in a small skillet over medium-high. Sear the chicken 3 minutes per side until deeply golden, then lift it onto a plate (it won't be cooked through yet).",
      "Lower the heat to medium, add the minced garlic and rice, and toast for 1 minute, stirring, until the grains smell nutty.",
      "Pour in the broth, scrape up any browned bits from the base, and bring to a gentle simmer.",
      "Nestle the chicken back in, skin-side up, cover tightly, and cook on low for 18 minutes without lifting the lid.",
      "Stir the frozen peas into the rice, replace the lid, and rest off the heat for 5 minutes. The residual steam finishes the peas and lets the rice fluff. Fork through and serve.",
    ],
    tip: "No lid? Cover the skillet with a plate or foil — trapping the steam is what cooks the rice evenly.",
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
    steps: [
      "Spoon the Greek yogurt into a bowl and add the scoop of whey.",
      "Whisk hard with a fork for about 30 seconds until the powder fully dissolves and the yogurt turns smooth and mousse-like — add a splash of milk or water if it gets too thick.",
      "Layer the berries over one half and the granola over the other so the granola stays crunchy.",
      "Warm the peanut butter for 10 seconds so it pours, then drizzle it across the top with the honey.",
      "Eat immediately — granola softens fast once it hits the yogurt.",
    ],
    tip: "Prep the yogurt-whey base the night before; just add toppings in the morning so the granola never goes soggy.",
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
    steps: [
      "Separate the butter lettuce into whole cups, rinse, and pat dry — set them on a plate ready to fill.",
      "Heat a dry skillet over medium-high. Add the turkey and press it flat; let it sit undisturbed 2 minutes to build a browned crust before breaking it apart.",
      "Push the meat to one side, add the garlic and ginger to the bare pan, and stir 30 seconds until fragrant, then mix into the turkey.",
      "Pour in the soy sauce and sesame oil and toss for 1 minute until the liquid glazes the meat and the pan is almost dry.",
      "Spoon the turkey into the lettuce cups, top with the julienned carrot and cucumber for crunch, and finish with a zigzag of sriracha.",
    ],
    tip: "Brown the turkey in a thin layer and resist stirring early — that crust is most of the flavour in a low-carb dish.",
  },
  {
    title: "Sheet-pan salmon, sweet potato and broccoli",
    by: "Marco Bellini", byRole: "Chef", diet: "Seafood",
    time: "35 min", servings: 1, kcal: 620,
    macros: { p: 44, c: 58, f: 22 },
    tags: ["High protein", "GF", "Sheet-pan"],
    hero: "linear-gradient(135deg, #e07856 0%, #f4b860 50%, #1a1612 100%)",
    note: "Wednesday dinner — pairs with tonight's lift.",
    ingredients: ["6 oz salmon fillet", "1 medium sweet potato, cubed", "2 cups broccoli florets", "2 tbsp olive oil", "1 tsp paprika, salt, pepper", "1 lemon, sliced"],
    steps: [
      "Heat the oven to 425°F (220°C) and line a sheet pan with parchment so nothing sticks.",
      "Toss the sweet potato cubes with 1 tbsp oil, the paprika, salt and pepper, spread them out, and roast 15 minutes — a head start so they finish at the same time as the fish.",
      "Meanwhile, pat the salmon dry and rub it with a little oil, salt and pepper.",
      "Pull the pan out, push the potatoes to one side, and add the broccoli and salmon. Drizzle the remaining oil over the broccoli and lay lemon slices on the fish.",
      "Roast another 12–15 minutes, until the broccoli edges char and the salmon flakes when nudged with a fork (internal temp ~125°F for medium).",
      "Squeeze the roasted lemon over everything and serve straight from the pan.",
    ],
    tip: "Roughly equal-sized sweet potato cubes cook evenly — aim for 3/4-inch pieces so none are raw while others turn to mush.",
  },
  {
    title: "Steak and sweet potato hash",
    by: "Daniel Reyes", byRole: "Chef", diet: "Meat",
    time: "25 min", servings: 1, kcal: 660,
    macros: { p: 46, c: 56, f: 26 },
    tags: ["High protein", "Iron-rich"],
    hero: "linear-gradient(135deg, #8b3a28 0%, #c95a3c 55%, #1a1612 100%)",
    note: "Thursday — leg-day refuel.",
    ingredients: ["6 oz sirloin steak", "1 sweet potato, diced small", "1/2 onion, sliced", "1 bell pepper, diced", "1 tbsp olive oil", "Garlic powder, smoked paprika"],
    steps: [
      "Take the steak out of the fridge 15 minutes ahead and season it generously with salt — room-temperature meat sears more evenly.",
      "Heat the oil in a skillet over medium. Add the small-diced sweet potato in a single layer and cook 8 minutes, covered, stirring occasionally, until tender with crisp edges.",
      "Add the onion, bell pepper, garlic powder and smoked paprika; cook 5 more minutes until the vegetables soften and caramelise. Scrape the hash onto a plate.",
      "Turn the heat to high. Sear the steak 3 minutes per side for medium-rare, pressing it down for full contact.",
      "Rest the steak on a board for 4 minutes — this keeps the juices in — then slice it thinly against the grain.",
      "Pile the hash back in the warm pan, fan the steak over the top, and spoon any resting juices back over.",
    ],
    tip: "Always slice steak against the grain; it shortens the muscle fibres so each bite is far more tender.",
  },
  {
    title: "Shrimp and quinoa harvest bowl",
    by: "Dr. Priya Nair", byRole: "Dietician", diet: "Seafood",
    time: "20 min", servings: 1, kcal: 560,
    macros: { p: 40, c: 62, f: 16 },
    tags: ["Pescatarian", "Meal prep", "GF"],
    hero: "linear-gradient(135deg, #f1a48f 0%, #e07856 55%, #1a1612 100%)",
    note: "Friday — light enough for an evening session.",
    ingredients: ["6 oz shrimp, peeled", "3/4 cup cooked quinoa", "1 cup roasted veg (zucchini, peppers)", "1 tbsp olive oil + lemon", "Feta crumbles", "Parsley"],
    steps: [
      "Pat the shrimp very dry and season with salt and pepper — wet shrimp steam and turn rubbery.",
      "Heat the olive oil in a skillet over medium-high until shimmering.",
      "Add the shrimp in a single layer and cook 2 minutes per side, just until they curl into a loose C-shape and turn opaque. A tight O means they're overcooked.",
      "Squeeze the lemon over the pan to deglaze, swirling the shrimp in the juices for 15 seconds.",
      "Build the bowl: warm quinoa as the base, the roasted veg alongside, shrimp on top.",
      "Scatter with feta and torn parsley, and spoon the pan juices over for extra brightness.",
    ],
    tip: "Cook to colour, not the clock: shrimp are done the moment they're pink and opaque — they keep cooking off the heat.",
  },
  {
    title: "Black bean and sweet potato tacos",
    by: "Aisha Bello", byRole: "Chef", diet: "Vegan",
    time: "20 min", servings: 1, kcal: 540,
    macros: { p: 24, c: 78, f: 14 },
    tags: ["Vegan", "Fiber", "Quick"],
    hero: "linear-gradient(135deg, #d8a64a 0%, #8b5e30 60%, #1a1612 100%)",
    note: "Saturday — easy + carby for a rest day.",
    ingredients: ["1 cup black beans", "1 small sweet potato, cubed", "3 corn tortillas", "1/2 avocado", "Lime, cilantro, hot sauce", "1 tsp cumin"],
    steps: [
      "Heat the oven to 425°F (220°C). Toss the sweet potato cubes with a little oil, salt and half the cumin and roast 18 minutes until caramelised at the edges.",
      "Meanwhile, warm the black beans in a small pan with the rest of the cumin and a splash of water; mash about a third of them to make the mix creamy and help it cling to the tortilla.",
      "Char the corn tortillas directly over a gas flame or in a dry skillet, 20 seconds a side, until blistered and pliable.",
      "Mash the avocado with a squeeze of lime and a pinch of salt.",
      "Build each taco: smear of avocado, spoon of beans, roasted sweet potato.",
      "Finish with torn cilantro, a squeeze of lime and a few dashes of hot sauce.",
    ],
    tip: "Mashing a portion of the beans is the trick to taco filling that holds together instead of rolling off the tortilla.",
  },
];

// Additional recipes for the full Recipes library — spread across creator
// types (Nutritionist / Dietician / Chef) and diet categories.
const RECIPES_EXTRA = [
  {
    title: "Red lentil and spinach dahl",
    by: "James Cole", byRole: "Dietician", diet: "Vegan",
    time: "30 min", servings: 2, kcal: 470,
    macros: { p: 24, c: 68, f: 12 },
    tags: ["Vegan", "Fiber", "Batch"],
    hero: "linear-gradient(135deg, #e0913c 0%, #a34e1f 60%, #1a1612 100%)",
    note: "A cheap, high-fibre staple that reheats beautifully.",
    ingredients: ["1 cup red lentils", "2 cups veg broth", "1 can chopped tomatoes", "2 cups spinach", "Onion, garlic, ginger", "1 tbsp curry powder + 1 tsp cumin"],
    steps: [
      "Rinse the red lentils in a sieve under cold water until it runs clear — this removes surface starch so the dahl isn't gluey.",
      "Warm 1 tbsp oil in a pot over medium heat and soften the diced onion for 4 minutes, then add the minced garlic and ginger for another minute.",
      "Add the curry powder and cumin and toast for 30 seconds, stirring constantly, until fragrant — blooming the spices in oil deepens the flavour.",
      "Tip in the lentils, chopped tomatoes and broth, stir, and bring to a boil.",
      "Lower to a simmer and cook 18–20 minutes, stirring now and then so nothing catches, until the lentils collapse into a creamy purée.",
      "Stir the spinach through in handfuls until wilted, season with salt, and loosen with a splash of water if needed. Serve over rice.",
    ],
    tip: "Toasting (blooming) the spices in oil before the liquid goes in is the single biggest upgrade for any curry.",
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
    steps: [
      "Warm 1 tbsp oil in an oven-safe skillet over medium and soften the diced onion and red pepper for 6 minutes until slumped and sweet.",
      "Stir in the smoked paprika and cumin and cook 30 seconds to bloom.",
      "Add the chopped tomatoes and drained chickpeas, season, and simmer 8 minutes until the sauce thickens enough to hold a spoon-trail.",
      "Make four wells in the sauce with the back of a spoon and crack an egg into each.",
      "Cover and cook 5–6 minutes, until the whites are set but the yolks still wobble — or slide under a hot grill for runnier yolks.",
      "Scatter with crumbled feta and parsley and bring the pan to the table with bread for dipping.",
    ],
    tip: "Stop cooking while the yolks still jiggle; they keep setting in the hot sauce on the way to the table.",
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
    steps: [
      "Heat the grill (broiler) to high and line a tray with foil.",
      "Whisk the miso, honey, soy and mirin into a smooth, glossy glaze.",
      "Pat the cod dry, set it on the tray, and brush a thick layer of glaze over the top.",
      "Grill 8–10 minutes, watching closely, until the glaze caramelises to a lacquered amber and the fish flakes at a gentle press. If it darkens too fast, drop the shelf a level.",
      "While it cooks, halve the bok choy and steam or stir-fry it 3 minutes until the stems are crisp-tender and the leaves bright green.",
      "Plate the cod on the greens and finish with sesame seeds and sliced spring onion.",
    ],
    tip: "Miso burns quickly because of its sugars — keep the fish a few inches from the element and stay by the oven.",
  },
  {
    title: "Tofu and edamame poke bowl",
    by: "Aisha Bello", byRole: "Chef", diet: "Plant-based",
    time: "15 min", servings: 1, kcal: 520,
    macros: { p: 26, c: 64, f: 18 },
    tags: ["Plant-based", "No-cook", "Bowl"],
    hero: "linear-gradient(135deg, #5fbf8f 0%, #3a8f6a 50%, #1a1612 100%)",
    note: "Crispy tofu, cool rice, all the toppings.",
    ingredients: ["6 oz firm tofu, cubed", "3/4 cup sushi rice", "1/2 cup edamame", "Cucumber + carrot", "Avocado", "Soy + sriracha mayo"],
    steps: [
      "Press the tofu: wrap the block in a clean towel and rest a heavy pan on top for 10 minutes to squeeze out water so it crisps instead of steaming.",
      "Cube the tofu and pan-fry in 1 tsp oil over medium-high, 6–8 minutes, turning so several sides turn golden and firm.",
      "Toss the hot tofu in a splash of soy off the heat so it soaks in.",
      "Spoon the (cooled) sushi rice into a bowl as the base.",
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
    tags: ["High protein", "Low carb"],
    hero: "linear-gradient(135deg, #cdb98a 0%, #7e6a3c 55%, #1a1612 100%)",
    note: "Yogurt-based dressing keeps it lean without losing the punch.",
    ingredients: ["6 oz chicken breast", "Romaine, chopped", "2 tbsp Greek yogurt + lemon + garlic", "1 tbsp parmesan", "Anchovy paste, tiny", "Wholegrain croutons, few"],
    steps: [
      "Butterfly or pound the chicken breast to an even thickness so it cooks through without drying out, then season with salt and pepper.",
      "Grill or pan-sear over medium-high heat, 5 minutes per side, until the internal temp hits 165°F and the surface has clear grill marks.",
      "Rest the chicken 5 minutes while you make the dressing.",
      "Whisk the Greek yogurt with lemon juice, grated garlic, the parmesan and a tiny dab of anchovy paste — taste and adjust salt; the anchovy adds savoury depth without fishiness.",
      "Toss the chopped romaine with just enough dressing to coat lightly.",
      "Slice the chicken, lay it over the salad, and finish with the croutons and an extra dusting of parmesan.",
    ],
    tip: "Pounding the breast to an even thickness is how you get juicy chicken — thin tips overcook before thick centres are done.",
  },
  {
    title: "Beef and broccoli stir-fry",
    by: "Daniel Reyes", byRole: "Chef", diet: "Meat",
    time: "20 min", servings: 1, kcal: 600,
    macros: { p: 45, c: 48, f: 24 },
    tags: ["High protein", "Wok"],
    hero: "linear-gradient(135deg, #7a3320 0%, #b8552f 55%, #1a1612 100%)",
    note: "Hot pan, fast hands — better than takeout.",
    ingredients: ["6 oz flank steak, sliced thin", "3 cups broccoli", "2 tbsp soy + 1 tbsp oyster sauce", "Garlic + ginger", "1 tsp cornstarch slurry", "Rice to serve"],
    steps: [
      "Slice the flank steak as thin as you can across the grain and toss it with 1 tsp soy and 1 tsp cornstarch; let it sit 10 minutes to tenderise (a velveting shortcut).",
      "Mix the remaining soy, the oyster sauce and 2 tbsp water in a small bowl so the sauce is ready before the pan gets hot.",
      "Get a wok or large skillet smoking hot with 1 tbsp oil. Sear the beef in a single layer for 90 seconds without moving it, then flip and remove to a plate — it should still be a touch underdone.",
      "Add the broccoli with a splash of water, cover, and steam-fry 3 minutes until bright green and crisp-tender; add the garlic and ginger for the last 30 seconds.",
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
    tags: ["Vegan", "High protein", "Meal prep"],
    hero: "linear-gradient(135deg, #b89a3c 0%, #6b6a23 55%, #1a1612 100%)",
    note: "Tempeh brings the protein vegans often miss at dinner.",
    ingredients: ["6 oz tempeh, sliced", "3 cups broccoli", "3 tbsp teriyaki", "Garlic + ginger", "3/4 cup brown rice", "Sesame seeds"],
    steps: [
      "Slice the tempeh into thin planks and steam them for 5 minutes — this mellows the slightly bitter edge tempeh can have and helps it absorb the glaze.",
      "Pat the planks dry, then pan-fry in 1 tsp oil over medium-high, 3 minutes a side, until golden and crisp.",
      "Add the broccoli and a splash of water to the pan, cover, and steam-fry 4 minutes until crisp-tender.",
      "Add the garlic and ginger for 30 seconds, then pour in the teriyaki and toss for 2 minutes until it reduces to a sticky glaze that coats everything.",
      "Spoon over warm brown rice and finish with sesame seeds.",
    ],
    tip: "Steaming tempeh before frying is the fix if you've found it bitter before — it opens it up to soak in the sauce.",
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
    steps: [
      "Bring a pot of water to a gentle boil and lower in the eggs for exactly 7 minutes for jammy yolks, then chill them in cold water and peel.",
      "In the same water, boil the halved baby potatoes 10 minutes until tender, adding the green beans for the final 2 minutes, then drain.",
      "Whisk the vinaigrette: olive oil, dijon, a squeeze of lemon, salt and pepper, emulsified until it thickens slightly.",
      "Drain the tuna well and break it into large flakes.",
      "Arrange the potatoes, beans, halved tomatoes, olives and tuna in sections in a bowl, and halve the eggs on top.",
      "Spoon the vinaigrette over everything just before serving.",
    ],
    tip: "Boil eggs and potatoes in the same pot to save time and washing-up — start the eggs, add potatoes alongside.",
  },
  {
    title: "Roasted veg and halloumi traybake",
    by: "Marco Bellini", byRole: "Chef", diet: "Vegetarian",
    time: "35 min", servings: 2, kcal: 520,
    macros: { p: 26, c: 44, f: 28 },
    tags: ["Vegetarian", "Sheet-pan"],
    hero: "linear-gradient(135deg, #c98a4e 0%, #7e5a2c 55%, #1a1612 100%)",
    note: "Halloumi gets golden and squeaky — no fussing required.",
    ingredients: ["7 oz halloumi, sliced", "Courgette + pepper + red onion", "1 can chickpeas", "2 tbsp olive oil", "Oregano + paprika", "Lemon to finish"],
    steps: [
      "Heat the oven to 425°F (220°C).",
      "Chop the courgette, pepper and red onion into similar-sized chunks, drain and dry the chickpeas, and toss everything on a sheet pan with the oil, oregano, paprika, salt and pepper.",
      "Spread in a single layer — crowding steams the veg — and roast 20 minutes until starting to colour.",
      "Pat the halloumi slices dry, nestle them among the veg, and roast a further 10 minutes until the cheese is golden and the veg edges are charred.",
      "Squeeze lemon over the hot tray to cut the richness and serve straight away, while the halloumi is still soft.",
    ],
    tip: "Halloumi turns rubbery as it cools — serve it the moment it comes out of the oven for that squeaky, golden bite.",
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
    steps: [
      "Heat the oven to 425°F (220°C). Toss the cubed sweet potato and drained chickpeas with oil and salt and roast 20 minutes, shaking halfway, until the potato is tender and the chickpeas crisp.",
      "While that roasts, cook the quinoa if not already done, and thinly slice the red cabbage and ribbon the carrot.",
      "Make the dressing: whisk the tahini with lemon juice and a pinch of salt — it'll seize and thicken first, then loosen it with water a teaspoon at a time until it pours.",
      "Spoon the quinoa into a bowl and arrange the roasted and raw veg in colour-blocked sections on top.",
      "Add sliced avocado, drizzle generously with the tahini dressing, and scatter with pumpkin seeds.",
    ],
    tip: "Tahini dressing always seizes before it smooths — keep adding water a little at a time and it comes together silky.",
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
    steps: [
      "Combine the turkey, egg, breadcrumbs, grated garlic, parmesan, chopped parsley, salt and pepper in a bowl and mix with a light hand — overworking makes dense, tough meatballs.",
      "Roll into 1.5-inch balls with damp hands so the mix doesn't stick.",
      "Brown them in a little oil over medium-high, turning, about 6 minutes — you're after colour, not cooking them through yet.",
      "Pour in the marinara, scraping up the fond, bring to a simmer, and cook gently 12 minutes until the meatballs are cooked through (165°F) and the sauce has thickened.",
      "Meanwhile, boil the pasta in well-salted water to al dente and reserve a splash of the cooking water.",
      "Toss the pasta with a little sauce (loosen with pasta water if needed), top with meatballs and remaining sauce, and tear basil over.",
    ],
    tip: "Mix the meatball mixture just until combined — the gentler you are, the more tender they stay.",
  },
  {
    title: "Smoked salmon and avocado toast",
    by: "Rae Lindqvist", byRole: "Nutritionist", diet: "Seafood",
    time: "10 min", servings: 1, kcal: 440,
    macros: { p: 28, c: 38, f: 20 },
    tags: ["Seafood", "Breakfast", "Omega-3"],
    hero: "linear-gradient(135deg, #e6917a 0%, #b65a48 55%, #1a1612 100%)",
    note: "Five minutes, restaurant brunch energy.",
    ingredients: ["2 slices rye/sourdough", "1/2 avocado", "3 oz smoked salmon", "Lemon + capers", "Dill + cracked pepper", "Optional poached egg"],
    steps: [
      "Toast the rye or sourdough until deeply golden and crisp — a sturdy base stops it going soggy under the toppings.",
      "Mash the avocado with a squeeze of lemon and a pinch of salt, then spread it thickly to the edges.",
      "Drape the smoked salmon over in loose folds rather than flat — the ruffles look and eat better.",
      "Scatter with capers, fresh dill and plenty of cracked black pepper.",
      "If you want it heartier, slide a poached egg on top and break the yolk just before serving with a final squeeze of lemon.",
    ],
    tip: "For a clean poached egg, use the freshest egg you can and swirl the simmering water into a gentle vortex before dropping it in.",
  },
  {
    title: "Black-eyed pea and coconut curry",
    by: "James Cole", byRole: "Dietician", diet: "Vegan",
    time: "30 min", servings: 2, kcal: 500,
    macros: { p: 20, c: 66, f: 16 },
    tags: ["Vegan", "Fiber", "Batch"],
    hero: "linear-gradient(135deg, #cf8a3a 0%, #6f8a3c 55%, #1a1612 100%)",
    note: "Creamy, warming, and full of plant protein and fibre.",
    ingredients: ["1 can black-eyed peas", "1 can light coconut milk", "1 can tomatoes", "Onion, garlic, ginger", "Curry powder + turmeric", "Spinach + lime"],
    steps: [
      "Soften the diced onion in 1 tbsp oil over medium heat for 4 minutes, then add the minced garlic and ginger for another minute.",
      "Stir in the curry powder and turmeric and toast 30 seconds until fragrant — blooming the spices builds the base flavour.",
      "Add the tomatoes and let them cook down 3 minutes until jammy and split.",
      "Pour in the coconut milk and drained black-eyed peas, bring to a gentle simmer, and cook 15 minutes, stirring occasionally, until thickened and glossy.",
      "Wilt the spinach through at the end, finish with a squeeze of lime and salt to taste, and serve over rice.",
    ],
    tip: "A squeeze of lime at the very end lifts a coconut curry — the acidity balances the richness and wakes everything up.",
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
    steps: [
      "Heat the oven to 440°F (225°C). Trim the cauliflower and slice it through the core into two or three thick 1-inch 'steaks' — keeping the core attached is what holds each slab together.",
      "Brush both sides with olive oil and rub with the smoked paprika, cumin, salt and pepper.",
      "Roast 25 minutes, flipping carefully halfway, until the edges are deeply charred and a knife slides through the stem.",
      "Meanwhile, finely chop the parsley and cilantro and stir together with minced garlic, red wine vinegar, chili flakes, the remaining olive oil and a pinch of salt to make the chimichurri.",
      "Let the chimichurri sit 10 minutes so the flavours meld.",
      "Spoon it generously over the hot cauliflower steaks just before serving.",
    ],
    tip: "Slice through the core, not across it — the stem is the spine that keeps a cauliflower steak in one piece on the flip.",
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
const RECIPE_NEEDS = ["High-protein", "Low-carb", "Gluten-free", "Dairy-free", "Mediterranean"];
const _RECIPE_NOT_GF = new Set([
  "Tempo turkey lettuce cups", "Miso-glazed cod with greens", "Tofu and edamame poke bowl",
  "Grilled chicken Caesar, lightened", "Beef and broccoli stir-fry", "Tempeh and broccoli teriyaki",
  "Turkey meatballs in marinara", "Smoked salmon and avocado toast", "Greek yogurt power bowl",
]);
const _RECIPE_HAS_DAIRY = new Set([
  "Greek yogurt power bowl", "Shrimp and quinoa harvest bowl", "Chickpea shakshuka",
  "Grilled chicken Caesar, lightened", "Roasted veg and halloumi traybake", "Turkey meatballs in marinara",
]);
const _RECIPE_MED = new Set([
  "Sheet-pan salmon, sweet potato and broccoli", "Shrimp and quinoa harvest bowl", "Chickpea shakshuka",
  "Tuna niçoise bowl", "Roasted veg and halloumi traybake",
]);
function recipeNeeds(r) {
  const out = [];
  const p = (r.macros && r.macros.p) || 0;
  const c = (r.macros && r.macros.c) || 0;
  if (p >= 30) out.push("High-protein");
  if (c <= 40) out.push("Low-carb");
  if (!_RECIPE_NOT_GF.has(r.title)) out.push("Gluten-free");
  if (!_RECIPE_HAS_DAIRY.has(r.title)) out.push("Dairy-free");
  if (_RECIPE_MED.has(r.title)) out.push("Mediterranean");
  return out;
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

// Modal with full recipe — ingredients + steps + chef's tip. Closed by clicking
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
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: TEAL_BRIGHT, marginBottom: 6 }}>CHEF'S TIP</div>
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
  window.RECIPE_NEEDS = RECIPE_NEEDS;
  window.recipeNeeds = recipeNeeds;
}
