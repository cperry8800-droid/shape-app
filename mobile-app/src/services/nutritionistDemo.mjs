// Sample nutritionist pages: the mobile entry point for the canonical module. CANONICAL in
// public/newdesign/nutritionistDemo.mjs, so a seeded nutritionist opened on the website shows the
// same sample as in the app. The Shape Kitchen catalog its sample recipes are written from is the
// app's own (kitchenRecipes.js), so this entry point hands it in; the website has no copy and draws
// the sample without recipes.
import { bsKitchenRecipe, bsKitchenMinutes } from '../broadsheet/kitchenRecipes.js';
import { bsNutritionistDemo as bsNutritionistDemoBare } from '../../../public/newdesign/nutritionistDemo.mjs';

export * from '../../../public/newdesign/nutritionistDemo.mjs';

const APP_KITCHEN = Object.freeze({ recipe: bsKitchenRecipe, minutes: bsKitchenMinutes });

/** The sample nutritionist's page, with the app's kitchen catalog (see the canonical module). */
export function bsNutritionistDemo(opts = {}) {
  return bsNutritionistDemoBare({ catalog: APP_KITCHEN, ...opts });
}
