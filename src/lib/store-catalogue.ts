// Authoritative Shape Store catalogue (server-side).
//
// The store UIs (mobile + website) render their own copy of this list, but the
// redemption endpoint must NOT trust the cost the client sends — it looks the
// item up here and charges the real cost. Keep this in sync with:
//   - public/newdesign/store.jsx  (website)
//   - BSShapeStorePage in mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
//
// Uniform value: 150 points = $1 (repriced from 20 — 2026-07-20 owner call: the old rate minted ~12x the subscription price in monthly redemption value). Cost derives from the
// item's retail $, so the rate is consistent across the whole catalogue.

export const SHAPE_PTS_PER_USD = 150;
// Dollar-credits cost Shape REAL cash (we still pay the coach), unlike merch
// (margin) — so they price at 2x the base rate (owner call 2026-07-20, option
// 2A). The kind === 'credit' branch below is the ONE place the split lives.
export const SHAPE_PTS_PER_USD_CREDIT = 300;

export type StoreItem = {
  id: string;
  name: string;
  cat: string;
  retail: number;
  /** Tier-locked items can't be redeemed (gated above the membership check). */
  locked?: boolean;
  kind?: 'merch' | 'credit' | 'service' | 'lead_boost';
  /** A Lead Boost's length. The database's `store_catalogue.boost_days` is the authority the
   *  redemption reads; this copy only maps a client's `days` to the item it means. */
  boostDays?: 7 | 14 | 30;
};

const RAW: Array<Omit<StoreItem, 'kind'> & { kind?: StoreItem['kind'] }> = [
  // Shape Merch
  { id: 'merch_cap_black', name: 'Shape Cap · Black', cat: 'Shape Merch', retail: 35, kind: 'merch' },
  { id: 'merch_cap_white', name: 'Shape Cap · White', cat: 'Shape Merch', retail: 35, kind: 'merch' },
  // merch_duffel removed 2026-07-20 (owner call: "remove duffel bag for now") —
  // the reprice migration DELETEs its live store_catalogue row.
  // merch_training_tee, merch_crewneck, merch_bottle, merch_canteen and
  // merch_towel removed 2026-08-31 (owner call) — 2026-08-31-store-merch-removal.sql
  // DELETEs their live store_catalogue rows and prunes the tier rewards that
  // offered them (see that file). Shape Merch is now the two caps.

  // Training
  { id: 'train_credit_25', name: '$25 session credit', cat: 'Training', retail: 25, kind: 'credit' },
  { id: 'train_credit_50', name: '$50 session credit', cat: 'Training', retail: 50, kind: 'credit' },
  { id: 'train_second_opinion', name: 'Coach 2nd-opinion', cat: 'Training', retail: 95, kind: 'service' },
  { id: 'train_program_review', name: 'Program review credit', cat: 'Training', retail: 85, kind: 'service' },

  // Nutrition
  { id: 'nutri_meal_plan_refresh', name: 'Meal-plan Refresh', cat: 'Nutrition', retail: 140, kind: 'service' },
  { id: 'nutri_credit_25', name: '$25 nutrition credit', cat: 'Nutrition', retail: 25, kind: 'credit' },
  { id: 'nutri_grocery_buildout', name: 'Grocery list buildout', cat: 'Nutrition', retail: 45, kind: 'service' },
  { id: 'nutri_recipe_pack', name: 'Recipe archive pack', cat: 'Nutrition', retail: 35, kind: 'service' },

  // Shape Perks
  // A Shape year is $5/mo × 12 = $60 — the credit covers exactly one year.
  { id: 'perk_annual_credit', name: 'Annual membership credit', cat: 'Shape Perks', retail: 60, kind: 'credit', locked: true },

  // Coach Tools. A Lead Boost is point-redeemed through redeem_lead_boost (POST /api/lead-boosts),
  // not through redeem_store_item: the redemption also writes the boost row, in one transaction.
  { id: 'lead_boost_7', name: 'Lead Boost · 7 days', cat: 'Coach Tools', retail: 79, kind: 'lead_boost', boostDays: 7 },
  { id: 'lead_boost_14', name: 'Lead Boost · 14 days', cat: 'Coach Tools', retail: 139, kind: 'lead_boost', boostDays: 14 },
  { id: 'lead_boost_30', name: 'Lead Boost · 30 days', cat: 'Coach Tools', retail: 249, kind: 'lead_boost', boostDays: 30 },
];

export const STORE_CATALOGUE: StoreItem[] = RAW.map((p) => ({ ...p }));

export function storeItemCost(item: StoreItem): number {
  const rate = item.kind === 'credit' ? SHAPE_PTS_PER_USD_CREDIT : SHAPE_PTS_PER_USD;
  return Math.round(item.retail * rate);
}

export function findStoreItem(id: string): StoreItem | undefined {
  return STORE_CATALOGUE.find((p) => p.id === id);
}

/**
 * Coach-credit wallet a credit item funds when redeemed: a Training credit
 * becomes 'session' credit (applies to a trainer booking), a Nutrition credit
 * becomes 'nutrition' credit (applies to a meal plan). Non-credit items → null.
 */
export function storeCreditKind(item: StoreItem): 'session' | 'nutrition' | null {
  if (item.kind !== 'credit') return null;
  if (item.cat === 'Training') return 'session';
  if (item.cat === 'Nutrition') return 'nutrition';
  return null;
}

/** Dollar value (in cents) a credit item adds to the wallet. */
export function storeCreditCents(item: StoreItem): number {
  return storeCreditKind(item) ? Math.round(item.retail * 100) : 0;
}

/**
 * The Lead Boost item a request means: by item id, or by the `days` the website and the app
 * send (7, 14 or 30). Anything else is no item, so a caller can never name a length the
 * catalogue does not sell. The length the boost actually gets comes from the database row.
 */
export function findLeadBoostItem(itemId: unknown, days: unknown): StoreItem | undefined {
  const boosts = STORE_CATALOGUE.filter((p) => p.kind === 'lead_boost' && p.boostDays);
  const id = typeof itemId === 'string' ? itemId.trim() : '';
  if (id) return boosts.find((p) => p.id === id);
  const n = Number(days);
  if (!Number.isInteger(n)) return undefined;
  return boosts.find((p) => p.boostDays === n);
}
