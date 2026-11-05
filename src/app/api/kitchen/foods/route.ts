// Shape Kitchen's recipes as the meal builder's foods (P6, 2026-11-05): the website meal builder's
// "Kitchen 100 / Mine" search reads them here, from the one catalog the app ships
// (mobile-app/src/broadsheet/shapeKitchenData.js), converted by src/lib/kitchenFoods.mjs: per-serving
// macros (the recipe's own), the tags a plan's exclusions read, prep minutes, the meals of the day it
// suits, and the ingredients with their amounts for one serving, which the grocery list adds up.
//
// GET /api/kitchen/foods → { foods: [...], stats: { recipes, lines, parsed, unparsed } }
//
// Public, like the /recipes pages the same catalog already serves: it holds Shape's own recipes and
// nothing about anyone. Cached for an hour; the catalog only changes with a deploy.

import { NextResponse } from 'next/server';
import { kitchenFoods } from '@/lib/kitchenFoods.mjs';

export const runtime = 'nodejs';

export async function GET() {
  const { foods, stats } = kitchenFoods();
  return NextResponse.json({ foods, stats }, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } });
}
