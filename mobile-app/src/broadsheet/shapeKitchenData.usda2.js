// Shape Kitchen — USDA MyPlate Kitchen import, batch 2 (15 recipes → catalog of 100).
//
// Same provenance and treatment as batch 1: USDA MyPlate Kitchen via myplate.food,
// US federal works, public domain under 17 USC § 105. Method, temps, times,
// quantities, servings and per-serving nutrition are the source's; every step is
// rewritten in Shape's voice with heat / vessel / time / doneness cues.
//
// These 15 were picked to close two gaps at once:
//   BALANCE — brings the catalog to Poultry 18, Seafood 18, Vegetarian 17,
//   Vegan 17, Meat 16, Plant-based 14 (100 total).
//   PROTEIN — batch 1 landed only 3 of 50 at macros.p >= 30. This batch is
//   12 of 15 at >= 25g and 5 at >= 30g, sourced by checking the nutrition data
//   BEFORE picking the recipe. Nothing was inflated to hit the threshold.
//
// Honest caveat: the Vegan and Plant-based picks are the weak end (23g, 18g, 14g).
// The whole MyPlate legume set was scanned; every plant dish above ~23g protein
// needed ham, bacon, beef or chicken removed to qualify as vegan, which is more
// surgery than an import should do. Plant-side high protein needs authored
// recipes, not a public-domain corpus.
//
// Validated: 0 errors against every rule in tests/shape-kitchen-data.test.mjs,
// 0 title or sourceUrl collisions with the existing 85, all 15 URLs fetched live
// (with a bogus-slug control confirming the site hard-404s rather than soft-200s).

export const USDA2_KITCHEN_RECIPES = [
  {
    title: "Pork tenderloin power bowl with quinoa",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/pork-power-bowl", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "45 min", servings: 4, kcal: 490, macros: { p: 38, c: 52, f: 14 },
    tags: ["High protein", "Bowl", "Meal prep"],
    hero: "linear-gradient(135deg, #c65d3b 0%, #4a6b32 55%, #1a1612 100%)",
    blurb: "Grilled pork, quick pickles and quinoa in one loaded bowl.",
    ingredients: [
      { n: "1 lb", m: "pork tenderloin, cubed", k: "550 kcal" },
      { n: "1 cup", m: "quinoa", k: "625 kcal" },
      { n: "15.5 oz", m: "black beans, rinsed", k: "350 kcal" },
      { n: "2 cups", m: "low-sodium vegetable stock" },
      { n: "2 cups", m: "kale" },
      { n: "2 medium", m: "carrots, ribbon peeled" },
      { n: "3", m: "radishes, sliced" },
      { n: "1/2 cup", m: "rice wine vinegar" },
      { n: "1/2 cup", m: "warm water" },
      { n: "1 clove", m: "garlic, minced" },
      { n: "1 tsp", m: "honey" },
      { n: "1/4 tsp", m: "salt" },
      { n: "1 tbsp", m: "olive oil" },
      { n: "2 tbsp", m: "lime juice" },
      { n: "1 tsp", m: "paprika" },
      { n: "1/2 tsp", m: "ground cumin" },
      { n: "1", m: "red bell pepper, in strips" },
      { n: "1/2", m: "avocado, sliced" },
    ],
    steps: [
      "Shake the carrot ribbons, radishes, vinegar, garlic, salt, honey and the warm water together in a jar and leave them to pickle for 30 minutes.",
      "Toss the pork cubes with the lime juice, olive oil, paprika and cumin, then cover and marinate 15 minutes while the grill heats to medium-high.",
      "Bring the quinoa, stock and kale to a boil in a medium saucepan, then cover, drop to low and simmer 15 minutes until the grains uncoil and the liquid is gone; rest 5 minutes off the heat.",
      "Thread the pork onto skewers and grill over medium-high, turning often, until the cubes are lacquered and a thermometer reads 145°F, about 10 minutes. Rest 3 minutes so the juices settle.",
      "Divide the quinoa between four bowls, arrange the beans, pepper strips, avocado and drained pickles around the edge, and pile the pork in the middle.",
    ],
    tip: "The pickled carrots keep a week in the fridge and are worth doubling. Cut the pork into even cubes or the small ones dry out before the big ones reach 145°F.",
  },
  {
    title: "Honey mustard pork chops",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/honey-mustard-pork-chops", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "20 min", servings: 4, kcal: 279, macros: { p: 42, c: 4, f: 10 },
    tags: ["High protein", "Low carb", "Quick"],
    hero: "linear-gradient(135deg, #d99b2f 0%, #8a4a22 55%, #1a1612 100%)",
    blurb: "Four ingredients, one skillet, 42g of protein a chop.",
    ingredients: [
      { n: "4", m: "top loin pork chops", k: "980 kcal" },
      { n: "1/3 cup", m: "orange juice", k: "40 kcal" },
      { n: "2 tbsp", m: "light honey mustard dressing", k: "60 kcal" },
      { n: "1 tbsp", m: "reduced-sodium soy sauce" },
    ],
    steps: [
      "Pat the chops dry on both sides — a wet surface steams instead of browning, and you lose the crust entirely.",
      "Set a large non-stick skillet over medium-high heat and cook the chops undisturbed until the underside is deep gold and lifts from the pan on its own, about 4 minutes.",
      "Turn the chops with a spatula, then pour in the orange juice, soy sauce and honey mustard dressing and stir to loosen the browned bits stuck to the pan.",
      "Cover, lower the heat and simmer 6 to 8 minutes, until the chops are cooked through and the glaze has reduced to a thin syrup that coats a spoon.",
      "Rest the chops off the heat for 3 minutes, then spoon the pan glaze back over them before serving.",
    ],
    tip: "Thin chops overcook fast — check at 6 minutes and pull them at 145°F. Swap the orange juice for pineapple juice if that is what is open.",
  },
  {
    title: "Mushroom and steak fajitas",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/mushroom-steak-fajitas", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "25 min", servings: 4, kcal: 451, macros: { p: 29, c: 43, f: 18 },
    tags: ["High protein", "Quick", "One-pan"],
    hero: "linear-gradient(135deg, #b8442e 0%, #6d7a2c 55%, #1a1612 100%)",
    blurb: "Seared sirloin and three colours of pepper, rolled hot.",
    ingredients: [
      { n: "12 oz", m: "sirloin steak, sliced thin", k: "600 kcal" },
      { n: "8", m: "whole-wheat tortillas, 6-inch", k: "720 kcal" },
      { n: "1 tbsp", m: "olive oil", k: "120 kcal" },
      { n: "3 cups", m: "sliced cremini mushrooms" },
      { n: "1 tbsp", m: "no-salt fiesta lime seasoning" },
      { n: "1 cup", m: "green bell pepper, in strips" },
      { n: "1 medium", m: "red bell pepper, in strips" },
      { n: "1 medium", m: "yellow bell pepper, in strips" },
      { n: "1 medium", m: "tomato, diced" },
      { n: "2 cups", m: "shredded iceberg lettuce" },
      { n: "4 tbsp", m: "non-fat sour cream" },
    ],
    steps: [
      "Slice the beef across the grain into 1/4-inch strips — cutting across the fibres is what keeps sirloin tender — and toss with half the lime seasoning.",
      "Toss the mushrooms and all three colours of pepper strips with the remaining seasoning in a large bowl until every piece is evenly coated.",
      "Heat the oil in a large non-stick skillet over medium-high and sear the beef 3 to 4 minutes, until browned at the edges but still pink inside; lift it out onto a plate.",
      "Add the coated vegetables to the same pan and sauté 5 to 8 minutes, until the mushrooms release their liquid and the peppers are slightly tender but still have bite.",
      "Return the beef and any resting juices and toss 1 to 2 minutes more, just long enough to heat it through without cooking the steak grey.",
      "Divide the mixture between the warmed tortillas, top with tomato, lettuce and a spoonful of sour cream, and roll them up tightly.",
    ],
    tip: "Crowding the pan is what turns this grey and watery — sear the beef in two batches if your skillet is small. Corn tortillas make it gluten free.",
  },
  {
    title: "Picadillo with brown rice",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/picadillo-0", license: "public-domain",
    by: null, byRole: null, diet: "Meat",
    time: "50 min", servings: 4, kcal: 547, macros: { p: 28, c: 76, f: 16 },
    tags: ["High protein", "Batch", "Fiber"],
    hero: "linear-gradient(135deg, #a83b23 0%, #7a5a24 55%, #1a1612 100%)",
    blurb: "Sweet-salty beef with olives, raisins and black beans.",
    ingredients: [
      { n: "1 cup", m: "uncooked brown rice", k: "680 kcal" },
      { n: "3/4 lb", m: "lean ground beef", k: "600 kcal" },
      { n: "15 oz", m: "black beans, rinsed", k: "350 kcal" },
      { n: "14.5 oz", m: "low-sodium diced tomatoes" },
      { n: "2 cups", m: "water" },
      { n: "2 tsp", m: "vegetable oil" },
      { n: "1", m: "onion, diced" },
      { n: "1", m: "bell pepper, diced" },
      { n: "2 cloves", m: "garlic, minced" },
      { n: "1 1/2 tsp", m: "dried oregano" },
      { n: "1 tsp", m: "ground cumin" },
      { n: "1/4 tsp", m: "black pepper" },
      { n: "1/4 tsp", m: "kosher salt" },
      { n: "1/4 cup", m: "green olives, chopped" },
      { n: "1/4 cup", m: "raisins" },
    ],
    steps: [
      "Cook the brown rice in the water as the package directs, roughly 45 minutes, then leave it covered off the heat so it steams dry and stays fluffy.",
      "Warm the oil in a large skillet over medium heat, add the onion, bell pepper and garlic and cook about 10 minutes, until the onion is soft and lightly browned at the edges.",
      "Stir in the oregano, cumin, black pepper and salt and let them toast in the hot oil for a few seconds, until the whole pan smells nutty rather than dusty.",
      "Add the beef in small handfuls so the pan never loses its heat, breaking it up as it goes, and cook about 10 minutes until no pink remains.",
      "Pour in the tomatoes and beans and simmer about 15 minutes, until the liquid has thickened and the mixture holds its shape on a spoon.",
      "Fold through the olives and raisins and cook 2 minutes more just to heat them, then spoon the picadillo over the brown rice.",
    ],
    tip: "It keeps three days in an airtight container and tastes better on day two. Skip the raisins if you want it savoury, but the sweet-salty contrast is the whole point.",
  },
  {
    title: "Turkey and vegetable stir-fry",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/vegetable-and-turkey-stir-fry", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "15 min", servings: 4, kcal: 301, macros: { p: 38, c: 22, f: 6 },
    tags: ["High protein", "Quick", "One-pan"],
    hero: "linear-gradient(135deg, #d4a13c 0%, #3f6b3a 55%, #1a1612 100%)",
    blurb: "Leftover roast turkey turned into a 15-minute wok dinner.",
    ingredients: [
      { n: "16 oz", m: "cooked turkey, cubed", k: "800 kcal" },
      { n: "20 oz", m: "frozen chopped vegetables", k: "200 kcal" },
      { n: "1 tbsp", m: "vegetable oil", k: "120 kcal" },
      { n: "2 thin slices", m: "ginger root, minced" },
      { n: "1 clove", m: "garlic, minced" },
      { n: "1/2 tsp", m: "salt" },
      { n: "1/2 tsp", m: "sugar" },
      { n: "1 tbsp", m: "cornstarch" },
      { n: "2 tsp", m: "low-sodium soy sauce" },
      { n: "1/2 cup", m: "low-sodium chicken stock" },
    ],
    steps: [
      "Heat the oil in a large frying pan or wok over high heat until it shimmers and slides easily across the surface of the pan.",
      "Add the ginger, garlic, turkey cubes, frozen vegetables and salt and stir-fry about 1 minute, tossing constantly to coat everything in the hot oil.",
      "Drop the heat if anything starts to catch — scorched garlic turns bitter and there is no rescuing it — then sprinkle in the sugar.",
      "If the vegetables are still firm, splash in a tablespoon of water, cover the pan and steam 2 minutes until they are crisp-tender and glossy.",
      "For gravy, whisk the cornstarch, soy sauce and stock until smooth, pour it round the pan and cook 30 seconds until it thickens and clings to the turkey.",
    ],
    tip: "The turkey is already cooked, so it only needs heating — keep it moving or it goes stringy. Cooked chicken works exactly the same way.",
  },
  {
    title: "Arroz con pollo with browned thighs",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/rice-chicken-arroz-con-pollo", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "1 hr 5 min", servings: 4, kcal: 415, macros: { p: 31, c: 51, f: 9 },
    tags: ["High protein", "One-pan", "Family"],
    hero: "linear-gradient(135deg, #e0a53a 0%, #a8471f 55%, #1a1612 100%)",
    blurb: "Chicken thighs braised straight into the rice they flavour.",
    ingredients: [
      { n: "4", m: "chicken thighs, 6 oz each", k: "1000 kcal" },
      { n: "1 cup", m: "long-grain white rice", k: "675 kcal" },
      { n: "14.5 oz", m: "low-sodium diced tomatoes", k: "100 kcal" },
      { n: "2 cups", m: "water" },
      { n: "1", m: "yellow onion, chopped" },
      { n: "1", m: "bell pepper, chopped" },
      { n: "3 cloves", m: "garlic, minced" },
      { n: "1 tsp", m: "ground cumin" },
      { n: "1 tsp", m: "dried oregano" },
      { n: "1 cube", m: "low-sodium chicken bouillon" },
      { n: "1/2 tsp", m: "kosher salt" },
    ],
    steps: [
      "Trim the excess fat from the thighs with kitchen scissors and pat them dry with paper towels — dry skin browns, damp skin only steams.",
      "Set a deep skillet over medium-high heat and brown the thighs skin side down about 5 minutes a side, until deeply golden and releasing from the pan on their own; move them to a plate.",
      "Pour off all but a tablespoon of the fat, lower the heat and cook the onion, pepper, garlic, cumin, oregano and salt about 10 minutes, until the onion is soft and translucent.",
      "Stir in the uncooked rice and the tomatoes so every grain is coated in fat and spice, then add the water and bouillon cube and bring it to a boil over high heat.",
      "Nestle the chicken back in skin side down, cover and cook on low for 20 minutes.",
      "Flip the pieces skin side up and cook 20 minutes more, until the rice is tender and the liquid is absorbed.",
      "Let the pan stand covered for 5 minutes before serving so the last of the steam finishes the grains at the top.",
    ],
    tip: "Do not lift the lid during the first 20 minutes — the escaping steam is what cooks the rice. Bone-in thighs give the best flavour, but drumsticks work.",
  },
  {
    title: "Chicken cacciatore",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/chicken-cacciatore", license: "public-domain",
    by: null, byRole: null, diet: "Poultry",
    time: "1 hr 10 min", servings: 4, kcal: 181, macros: { p: 29, c: 8, f: 4 },
    tags: ["High protein", "Low carb", "Comfort"],
    hero: "linear-gradient(135deg, #b93a26 0%, #5f6b2a 55%, #1a1612 100%)",
    blurb: "Skinless chicken slow-simmered in oregano tomato sauce.",
    ingredients: [
      { n: "4 pieces", m: "chicken, skin removed", k: "600 kcal" },
      { n: "1 cup", m: "canned tomatoes, low-sodium", k: "80 kcal" },
      { n: "1/2 cup", m: "tomato sauce, low-sodium", k: "40 kcal" },
      { n: "1", m: "onion, chopped" },
      { n: "1 tsp", m: "oregano" },
      { n: "1/8 tsp", m: "garlic powder" },
      { n: "1/8 tsp", m: "black pepper" },
    ],
    steps: [
      "Peel and chop the onion and tip it into a saucepan with the tomatoes, tomato sauce, garlic powder, oregano and black pepper.",
      "Simmer the sauce on low heat for 3 minutes, stirring once or twice, until it smells of oregano and the onion has lost its raw bite.",
      "Pull the skin off the chicken pieces if it is still attached — it saves a lot of fat and lets the sauce grip the meat directly.",
      "Settle the chicken into the sauce, cover the pan, and cook over low heat about 1 hour, until the meat pulls away from the bone with no resistance.",
      "Rest the pan off the heat for 5 minutes, then spoon the thickened sauce over each piece to serve.",
    ],
    tip: "Low and slow is the whole trick; a hard boil tightens the chicken and it never softens again. It reheats well and freezes for up to three months.",
  },
  {
    title: "Salmon burgers with sweet potato wedges",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/salmon-burgers-and-sweet-potato-oven-fries", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "50 min", servings: 4, kcal: 540, macros: { p: 37, c: 72, f: 13 },
    tags: ["High protein", "Budget", "Family"],
    hero: "linear-gradient(135deg, #e8873f 0%, #c9563c 55%, #1a1612 100%)",
    blurb: "Canned salmon does the heavy lifting; the oven does the rest.",
    ingredients: [
      { n: "4 large", m: "sweet potatoes", k: "920 kcal" },
      { n: "1 1/2 tbsp", m: "canola oil" },
      { n: "1 tbsp", m: "lemon pepper seasoning" },
      { n: "14.75 oz", m: "canned pink or red salmon", k: "580 kcal" },
      { n: "2", m: "green onions, chopped" },
      { n: "1/2 cup", m: "chopped red bell pepper" },
      { n: "8", m: "unsalted-top saltine crackers" },
      { n: "2 tsp", m: "lemon juice" },
      { n: "2", m: "egg whites, whisked" },
      { n: "2 tbsp", m: "plain low-fat yogurt" },
      { n: "1/4 tsp", m: "ground black pepper" },
      { n: "4", m: "whole-wheat buns", k: "480 kcal" },
      { n: "8 leaves", m: "Bibb lettuce" },
      { n: "2 medium", m: "tomatoes, sliced" },
    ],
    steps: [
      "Set a rack in the centre and heat the oven to 425°F (220°C), then scrub the sweet potatoes and cut them lengthways into thick wedges.",
      "Toss the wedges with the canola oil and lemon pepper blend, spread them in a single layer on a baking sheet, and roast 30 to 40 minutes, turning once or twice, until the edges are golden and a knife slides in easily.",
      "While they roast, drain the salmon and flake it in a medium bowl, mashing the soft bones in — they vanish completely and carry most of the calcium.",
      "Fold in the green onions, red pepper, crushed crackers, lemon juice, egg whites and yogurt, then shape four patties that just hold together without feeling packed tight.",
      "Coat a large nonstick skillet with cooking spray and set it over medium heat; cook the patties until deep golden underneath, about 4 minutes, then turn once and repeat — one flip only, or they crumble.",
      "Build each burger on a whole-wheat bun with Bibb lettuce and sliced tomato, and serve the sweet potato wedges hot from the sheet alongside.",
    ],
    tip: "Chilling the salmon mix for 15 minutes before shaping makes the patties far easier to flip, especially if the fish drained wet. Cooked patties keep three days and reheat best in a dry skillet.",
  },
  {
    title: "Oven fish sticks with spinach basil dip",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/easy-oven-fish-spinach-basil-dipping-sauce-spiced-apples", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "35 min", servings: 4, kcal: 492, macros: { p: 29, c: 76, f: 9 },
    tags: ["High protein", "Family", "Fiber"],
    hero: "linear-gradient(135deg, #d9a441 0%, #5f7a3a 55%, #1a1612 100%)",
    blurb: "Crisp oven-baked fish sticks with a sharp green yogurt dip.",
    ingredients: [
      { n: "1 lb", m: "frozen pollock or cod fillets", k: "400 kcal" },
      { n: "1/2 cup", m: "flour" },
      { n: "2", m: "egg whites, beaten" },
      { n: "3/4 cup", m: "whole-wheat bread crumbs", k: "320 kcal" },
      { n: "2 tbsp", m: "grated Parmesan" },
      { n: "1/8 tsp", m: "ground black pepper" },
      { n: "1 cup", m: "frozen chopped spinach, thawed" },
      { n: "1/2 cup", m: "chopped fresh basil" },
      { n: "1 clove", m: "garlic" },
      { n: "3/4 cup", m: "fat-free plain yogurt" },
      { n: "2 tbsp", m: "vinegar" },
      { n: "2 tsp", m: "honey" },
      { n: "3", m: "apples", k: "290 kcal" },
      { n: "1/2 cup", m: "raisins" },
      { n: "1/4 cup", m: "chopped pecans" },
      { n: "1/2 tsp", m: "cinnamon" },
      { n: "2 tsp", m: "unsalted butter" },
    ],
    steps: [
      "Set a rack in the centre and heat the oven to 450°F (230°C), then coat a baking sheet with cooking spray so the crumb crust releases cleanly.",
      "Blend the spinach, basil, garlic, yogurt, vinegar and honey until smooth and bright green, then chill the dip in the fridge while the fish bakes.",
      "Cut the pollock into strips about an inch wide — easiest while it is still part-frozen, since fully thawed fish tears instead of slicing.",
      "Set out the flour, the beaten egg whites, and the bread crumbs mixed with Parmesan and pepper; roll each strip through all three in turn, pressing so the coating grips.",
      "Bake 10 to 12 minutes, turning the strips as needed, until the crust is golden and the fish reads 145°F (63°C) at the thickest point on a thermometer.",
      "Meanwhile melt the butter in a medium saucepan and sauté the apple wedges, raisins, pecans and cinnamon over medium heat 3 to 5 minutes, until glossy but still slightly crisp.",
    ],
    tip: "Bake the strips on a wire rack set in the sheet pan if you want all four sides crisp rather than three. The dip keeps three days and doubles as a sandwich spread.",
  },
  {
    title: "Tuna salad on dressed romaine",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/tuna-salad-greens", license: "public-domain",
    by: null, byRole: null, diet: "Seafood",
    time: "15 min", servings: 4, kcal: 241, macros: { p: 29, c: 9, f: 10 },
    // ⚠ THE SOURCE'S OWN NUTRITION IS IMPOSSIBLE FOR ITS OWN INGREDIENT LIST, and the
    // macros above reproduce it verbatim (myplate.food publishes 5 oz tuna, 4 servings,
    // 28.72 g protein each). One 5 oz can of tuna carries ~23-33 g protein TOTAL; the mayo,
    // oil and vegetables add ~5 g, so the whole bowl holds ~40 g, not the 116 g those macros
    // claim across four servings. Codex read the gap correctly but proposed restoring "the
    // source's multi-can quantity" — there is no multi-can quantity; the source says 5 oz.
    // The "High protein" TAG is removed because it is the claim we can actually withdraw
    // without authoring nutrition data under a USDA byline. Correcting the macros themselves
    // is an OWNER/NUTRITION RULING, and it is not confined to this recipe: all 100 USDA
    // recipes carry their source's published figures, and that class is unmeasured.
    tags: ["Low carb", "Quick"],
    hero: "linear-gradient(135deg, #7fa650 0%, #c48a54 55%, #1a1612 100%)",
    blurb: "A deli classic, rebuilt as a proper low-carb protein plate.",
    ingredients: [
      { n: "5 oz", m: "canned tuna in water, drained", k: "180 kcal" },
      { n: "1/3 cup", m: "low-fat mayonnaise", k: "260 kcal" },
      { n: "4 cups", m: "chopped romaine lettuce" },
      { n: "1", m: "tomato, chopped" },
      { n: "1/4", m: "red onion" },
      { n: "1 tbsp", m: "olive oil", k: "120 kcal" },
      { n: "3 tbsp", m: "red wine vinegar" },
      { n: "1 tsp", m: "Italian seasoning" },
      { n: "1 dash", m: "black pepper" },
      { n: "1/4 cup", m: "chopped celery" },
      { n: "1", m: "carrot, peeled and grated" },
      { n: "1/4 cup", m: "chopped green onion" },
      { n: "4", m: "whole grain crackers" },
    ],
    steps: [
      "Whisk the olive oil, red wine vinegar, Italian seasoning and a dash of black pepper in a large salad bowl until the dressing thickens and stops separating.",
      "Add the romaine, tomato and red onion and toss for a full minute, until every leaf is glossy and coated rather than leaving dressing pooled at the bottom.",
      "In a second mixing bowl, fold the well-drained tuna with the low-fat mayonnaise, celery, grated carrot and green onion until it holds together in soft clumps.",
      "Chill both bowls in the fridge for 10 minutes — properly cold is what makes this eat like a real lunch instead of a limp desk salad.",
      "Divide the dressed greens between four plates, top each with a scoop of the tuna salad, and serve the whole grain crackers on the side.",
    ],
    tip: "Press the tuna hard against the tin lid to drain it — leftover water thins the mayonnaise and wilts the leaves within minutes. Dress the greens only just before serving.",
  },
  {
    title: "Tomato and garlic omelette with croutons",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/tomato-and-garlic-omelet", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "30 min", servings: 1, kcal: 322, macros: { p: 29, c: 38, f: 8 },
    tags: ["High protein", "Breakfast", "Fiber"],
    hero: "linear-gradient(135deg, #c8402f 0%, #6f8f3f 55%, #1a1612 100%)",
    blurb: "One pan, one plate, 29 grams of protein before nine.",
    ingredients: [
      { n: "3/4 cup", m: "egg substitute", k: "90 kcal" },
      { n: "10", m: "plum tomatoes, halved", k: "110 kcal" },
      { n: "1/2 slice", m: "whole wheat bread" },
      { n: "1/2 tsp", m: "olive oil" },
      { n: "1 clove", m: "garlic, finely chopped" },
      { n: "2 tbsp", m: "grated part-skim mozzarella", k: "40 kcal" },
      { n: "1 tsp", m: "basil, fresh or dried" },
    ],
    steps: [
      "Heat the oven to 300°F (150°C), cube the half slice of bread, and toss the cubes with the olive oil and chopped garlic in a small bowl.",
      "Spread them in a single layer on a baking sheet and toast 15 to 25 minutes, tossing once or twice, until dry and golden the whole way through.",
      "Spray a medium nonstick pan and set it over medium-high heat, then pour in the egg substitute and leave it undisturbed until the edges set and lift.",
      "Drop the heat to low and spread the egg evenly across the base — a cool pan is what keeps the underside tender instead of rubbery and blistered.",
      "Once the top is almost set, scatter the mozzarella, basil, halved tomatoes and croutons over one half, fold the bare half across, and slide it onto a plate.",
    ],
    tip: "Make the croutons in a big batch — they keep a week in a jar and the omelette then takes five minutes flat. Three whisked eggs stand in cleanly for the carton substitute.",
  },
  {
    title: "Butternut squash and ricotta pasta bake",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/butternut-squash-pasta-bake", license: "public-domain",
    by: null, byRole: null, diet: "Vegetarian",
    time: "1 hr 30 min", servings: 2, kcal: 515, macros: { p: 29, c: 70, f: 17 },
    tags: ["High protein", "Fiber", "Comfort"],
    hero: "linear-gradient(135deg, #e29b3c 0%, #b06a2c 55%, #1a1612 100%)",
    blurb: "Roasted squash instead of tomato, ricotta instead of cream.",
    ingredients: [
      { n: "2 1/2 cups", m: "butternut squash", k: "200 kcal" },
      { n: "4 oz", m: "whole wheat shell pasta", k: "400 kcal" },
      { n: "3 tbsp", m: "diced shallot" },
      { n: "1 tbsp", m: "minced sage" },
      { n: "1 clove", m: "garlic" },
      { n: "1/8 tsp", m: "salt" },
      { n: "1/4 tsp", m: "black pepper" },
      { n: "1/2 cup", m: "low-sodium vegetable broth" },
      { n: "3/4 cup", m: "low-fat ricotta", k: "170 kcal" },
      { n: "2 oz", m: "grated low-fat mozzarella" },
    ],
    steps: [
      "Heat the oven to 425°F (220°C), halve the butternut squash lengthways and scoop out the seeds and stringy centre with a spoon.",
      "Set the halves cut side down in a large baking dish with a quarter inch of water and bake about 45 minutes, until a knife meets no resistance at the neck.",
      "Meanwhile bring a pot of water to a rolling boil, cook the pasta until just tender to the bite, then drain it and spread it out so it stops cooking.",
      "Drop the oven to 375°F (190°C), then pulse 2 cups of the roasted squash in a food processor with the shallot, sage, garlic, salt and pepper until completely smooth.",
      "Loosen the purée with the vegetable broth, then layer a third of it in a small baking dish, half the pasta, all the ricotta, another third of sauce, the rest of the pasta and the last of the sauce.",
      "Scatter the mozzarella over the top and bake 25 minutes, until the cheese has browned in patches and the sauce bubbles up around the edges of the dish.",
    ],
    tip: "Roast the squash a day ahead — it is the only slow part, and the purée keeps three days covered. Loosen it with an extra splash of broth if it stiffens in the fridge.",
  },
  {
    title: "Split pea soup with carrot and thyme",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/split-pea-soup-0", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "2 hr 30 min", servings: 5, kcal: 334, macros: { p: 23, c: 55, f: 4 },
    tags: ["Fiber", "Batch", "Soup"],
    hero: "linear-gradient(135deg, #a8bd48 0%, #4e6a22 55%, #1a1612 100%)",
    blurb: "Two hours of low heat until the peas melt into the pot.",
    ingredients: [
      { n: "2 tsp", m: "vegetable oil", k: "80 kcal" },
      { n: "1", m: "Spanish onion, chopped" },
      { n: "3", m: "carrots, chopped", k: "75 kcal" },
      { n: "2", m: "celery stalks, chopped" },
      { n: "1 tsp", m: "dried thyme" },
      { n: "2 1/4 cups", m: "split peas, rinsed", k: "1500 kcal" },
      { n: "4 cups", m: "low-sodium vegetable broth" },
      { n: "6 cups", m: "water" },
      { n: "1/8 cup", m: "lemon juice" },
    ],
    steps: [
      "Set a heavy soup pot over medium heat and add the oil once the pot is hot, then tip in the onion, carrots, celery and thyme.",
      "Cook 10 to 15 minutes, stirring now and then, until the onion turns translucent and the carrots give easily under a spoon.",
      "Add the split peas, broth and 4 cups of the water, raise the heat to high and bring the pot to a rolling boil.",
      "Drop the heat to low and cook partially covered for about 2 hours, skimming off any foam, until the peas collapse completely and a spoon dragged through leaves a trail.",
      "Check every half hour and add up to 2 cups more water if it tightens too far; it should pour off the ladle, not mound.",
      "Stir in the lemon juice off the heat just before serving, which lifts the whole pot out of flatness.",
    ],
    tip: "USDA lists chicken or vegetable broth, so use vegetable and it is fully vegan. It thickens hard overnight, so loosen leftovers with water before reheating.",
  },
  {
    title: "Cuban black beans over brown rice",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/cuban-beans-and-rice", license: "public-domain",
    by: null, byRole: null, diet: "Vegan",
    time: "25 min", servings: 4, kcal: 403, macros: { p: 18, c: 76, f: 4 },
    tags: ["Fiber", "Pantry", "Budget"],
    hero: "linear-gradient(135deg, #d98b2b 0%, #46331f 55%, #1a1612 100%)",
    blurb: "Black beans, sweet peppers and brown rice, built for pennies.",
    ingredients: [
      { n: "1 tsp", m: "olive oil" },
      { n: "1 tbsp", m: "garlic, minced" },
      { n: "1 cup", m: "onion, chopped" },
      { n: "1 cup", m: "green bell pepper, diced" },
      { n: "3 cups", m: "black beans, drained", k: "660 kcal" },
      { n: "2 cups", m: "low-sodium vegetable broth" },
      { n: "1 tbsp", m: "vinegar" },
      { n: "1/2 tsp", m: "dried oregano" },
      { n: "to taste", m: "black pepper" },
      { n: "3 cups", m: "cooked brown rice", k: "650 kcal" },
    ],
    steps: [
      "Heat the olive oil in a large nonstick skillet over medium heat until it thins out and slides across the pan.",
      "Sauté the garlic, onion and green pepper about 3 minutes, until the onion goes golden at the edges and smells sweet.",
      "Stir in the black beans, vegetable broth, vinegar, oregano and black pepper, then bring the pan up to a boil.",
      "Lower to a simmer, cover and cook 5 minutes, until the liquid tightens around the beans and no longer looks watery.",
      "Spoon the beans over the warm brown rice and serve straight away, scraping the pan juices over the top.",
    ],
    tip: "The original calls for chicken broth; low-sodium vegetable broth swaps in cleanly and keeps it vegan. Rinse canned beans well or the sauce turns cloudy and oversalted.",
  },
  {
    title: "Curried quinoa with cauliflower and peas",
    source: "USDA MyPlate Kitchen", sourceUrl: "https://myplate.food/recipes/curried-quinoa-and-cauliflower", license: "public-domain",
    by: null, byRole: null, diet: "Plant-based",
    time: "35 min", servings: 4, kcal: 382, macros: { p: 14, c: 45, f: 18 },
    tags: ["Fiber", "GF", "Side"],
    hero: "linear-gradient(135deg, #e6b23c 0%, #7c5a20 55%, #1a1612 100%)",
    blurb: "Bloomed curry, tender cauliflower, quinoa that soaks it up.",
    ingredients: [
      { n: "1 cup", m: "quinoa, rinsed", k: "620 kcal" },
      { n: "2 tbsp", m: "olive oil", k: "240 kcal" },
      { n: "4 tsp", m: "curry powder" },
      { n: "1/2 tsp", m: "ground cumin" },
      { n: "1 cup", m: "low-sodium vegetable broth" },
      { n: "2 cloves", m: "garlic, chopped" },
      { n: "1 1/2 lb", m: "cauliflower florets" },
      { n: "1 cup", m: "frozen peas" },
      { n: "1/3 cup", m: "plain low-fat yogurt" },
      { n: "1/2 cup", m: "cashews, roasted" },
      { n: "1/4 cup", m: "cilantro, chopped" },
      { n: "2 tbsp", m: "green onion, chopped" },
      { n: "2 tbsp", m: "lime juice" },
    ],
    steps: [
      "Cook the quinoa until just tender following the packet, then fork it apart and leave it uncovered to steam dry.",
      "Heat the oil in a saucepan over medium-high, add the curry powder and cumin and cook 30 seconds, until fragrant; that bloom is the whole flavour base.",
      "Stir in the broth and garlic and bring to a boil, then add the cauliflower, cover and return it to the boil.",
      "Reduce to medium and simmer 3 minutes, add the frozen peas and cook on until a knife tip slides into a floret with no resistance.",
      "Off the heat, loosen the yogurt with 2 tablespoons of the hot pan liquid, then fold it through with the quinoa, cashews and cilantro.",
      "Scatter over the green onion, finish with the lime juice and taste before adding any pinch of salt.",
    ],
    tip: "Yogurt is the only animal ingredient, so a plain unsweetened plant yogurt makes it fully vegan. Add it off the heat or it will split into grains.",
  },
];

// Merge into the existing allowlists, same as batch 1. Keyed by exact title.
export const USDA2_NOT_GF = [
  "Honey mustard pork chops",
  "Mushroom and steak fajitas",
  "Salmon burgers with sweet potato wedges",
  "Oven fish sticks with spinach basil dip",
  "Tuna salad on dressed romaine",
  "Tomato and garlic omelette with croutons",
  "Butternut squash and ricotta pasta bake",
];

export const USDA2_HAS_DAIRY = [
  "Mushroom and steak fajitas",
  "Salmon burgers with sweet potato wedges",
  "Oven fish sticks with spinach basil dip",
  "Tomato and garlic omelette with croutons",
  "Butternut squash and ricotta pasta bake",
  "Curried quinoa with cauliflower and peas",
];

export const USDA2_MED = [
  "Chicken cacciatore",
  "Tomato and garlic omelette with croutons",
];

// No _KITCHEN_STEP_META entries are supplied. The passive-window overlay must
// state a duration the step text itself contains (bsStepTimers), so annotate
// these by hand only where a genuinely hands-off window exists — e.g. the
// 2-hour simmer in "Slow-simmered beef pot roast" or the 1-hour chill in
// "Charred corn and cornmeal patties". Un-annotated recipes are valid.

// ── Passive-window overlay for these 15 ───────────────────────────────────
// Merge into _KITCHEN_STEP_META in shapeKitchenData.js alongside the rest.
// 11 of the 15 can host an interleave window; 4 cannot and correctly carry
// none — "Turkey and vegetable stir-fry" (15 min, entirely hands-on),
// "Oven fish sticks" and "Salmon burgers" (their next step is authored
// "Meanwhile…"/"While they roast…", so the author already scheduled the
// window), and "Curried quinoa" (no step reaches the 4-minute floor).
export const USDA2_STEP_META = {
  // step 0 pickles and step 1 marinates "while the grill heats" — both run in the background of
  // the cook's own work. A hold blocks the recipe's OWN next step, so annotating them made a
  // 45-minute recipe claim 60. Only the quinoa is a hold the recipe actually waits out.
  // step 2 simmers the quinoa 15 minutes "; rest 5 minutes off the heat" — a semicolon this
  // time, same hidden hand-off. Splitting would need words invented for a public-domain
  // recipe (the rest clause is 30 characters against a 50-character floor), so the window
  // goes instead. This recipe now hosts nothing, which is the honest answer for it.
  "Pork tenderloin power bowl with quinoa": {},
  "Honey mustard pork chops": { 1: { min: 4, passive: true, station: "stove" }, 3: { min: 6, passive: true, station: "stove" } },
  // step 3 sautes the vegetables for its own 5-8 minutes — attended over high heat, not a
  // hold. No window; the recipe cannot host.
  "Mushroom and steak fajitas": {},
  // step 0's 45-minute rice runs in the BACKGROUND of the sauce — the recipe says 50 minutes
  // total, which is only true if they overlap. A hold blocks its own recipe (`freeAt`) and
  // occupies the one modelled stove, so annotating it made the board read 79 minutes and
  // stopped a two-dish session interleaving AT ALL. The sauce simmers are real holds.
  // aromatics softening in UNCOVERED fat need moving or they catch. Same class as the
  // soffritto dropped last round; the method gate misses these because the prose says
  // "cook the onion" rather than naming a technique at all.
  "Picadillo with brown rice": { 4: { min: 15, passive: true, station: "stove" } },
  "Arroz con pollo with browned thighs": { 4: { min: 20, passive: true, station: "stove" }, 5: { min: 20, passive: true, station: "stove" }, 6: { min: 5, passive: true, station: "off" } },
  // step 4 rests off the heat "then spoon the thickened sauce over each piece" — a terminal
  // hold hides its instruction like any other, because the wrap carries only the countdown.
  "Chicken cacciatore": { 3: { min: 60, passive: true, station: "stove" } },
  "Tuna salad on dressed romaine": { 3: { min: 10, passive: true, station: "off" } },
  // step 1 toasts "tossing once or twice" — attended. No window; the recipe cannot host.
  "Tomato and garlic omelette with croutons": {},
  // step 3 cooks "skimming off any foam" — attended, so the 2h is not a window.
  "Split pea soup with carrot and thyme": {},
  "Cuban black beans over brown rice": { 3: { min: 5, passive: true, station: "stove" } },
};
