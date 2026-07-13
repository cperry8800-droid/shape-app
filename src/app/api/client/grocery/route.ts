// Live grocery items for the newdesign Client "Grocery" page.
//
// Reads coach_pushed_items where the signed-in user is the recipient
// (client_id = auth.uid()) and the kind is 'meal', then extracts the
// payload.ingredients[] from each. Each ingredient becomes one grocery
// row, tagged with the source meal so the UI can show "FROM · MEAL NAME".
//
// Nutritionists push meals via /api/nutritionist/console (action:
// 'addItem', kind: 'meal'). The payload shape we read here is:
//   { name: string, ingredients?: Array<string | { item, qty?, category? }> }
// Plain strings are auto-parsed into { item, qty } using a simple heuristic.

import { NextResponse } from 'next/server';
import { dbError } from '@/lib/request-utils';
import { createClient } from '@/lib/supabase/server';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

const CATEGORY_HINTS: Array<{ re: RegExp; cat: string }> = [
  { re: /chicken|beef|pork|turkey|salmon|tuna|fish|shrimp|tofu|tempeh|steak|lamb|bacon|sausage|egg/i, cat: 'protein' },
  { re: /spinach|kale|broccoli|carrot|tomato|cucumber|pepper|onion|garlic|lettuce|berries|apple|banana|orange|potato|avocado|lemon|lime|herb|cilantro|parsley|fruit|vegetable|veggie/i, cat: 'produce' },
  { re: /yogurt|milk|cheese|butter|cream|kefir/i, cat: 'dairy' },
  { re: /rice|oat|pasta|bread|quinoa|flour|sugar|salt|oil|vinegar|sauce|spice|nut|seed|bean|lentil|whey|protein\s*powder|honey|syrup/i, cat: 'pantry' },
  { re: /frozen|ice/i, cat: 'frozen' },
];
function guessCategory(name: string): string {
  for (const h of CATEGORY_HINTS) if (h.re.test(name)) return h.cat;
  return 'other';
}

// Split a free-form string like "Chicken breast 3 lb" into { item, qty }.
// We treat the trailing number-followed-by-optional-unit-token as the qty.
function parseIngredientString(raw: string): { item: string; qty: string } {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { item: '', qty: '' };
  // Try patterns like "Item · 3 lb" or "Item - 3 lb" first.
  const sep = trimmed.match(/^(.+?)\s*[·\-—|]\s*(.+)$/);
  if (sep) return { item: sep[1].trim(), qty: sep[2].trim() };
  // Otherwise look for a trailing number + optional unit at the end.
  const trailing = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:lb|lbs|oz|g|kg|ml|l|ct|count|pcs?|pieces?|bag|bags|box|boxes|jar|jars|head|heads|bunch|bunches|btl|bottle|bottles|can|cans|tub|tubs)?)\s*$/i);
  if (trailing) return { item: trailing[1].trim(), qty: trailing[2].trim() };
  return { item: trimmed, qty: '' };
}

type IngredientLike = string | { item?: unknown; qty?: unknown; category?: unknown };
type MealPayload = { name?: unknown; ingredients?: unknown };

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from('coach_pushed_items')
    .select('id, payload, sent_at')
    .eq('client_id', user.id)
    .eq('kind', 'meal')
    .is('removed_at', null)
    .order('sent_at', { ascending: false });

  if (error) {
    return dbError(error, 'grocery write', 400);
  }

  // Flatten every pushed meal's ingredients[] into individual grocery rows.
  // De-dup on (mealId + normalized item name) so the UI ID stays stable for
  // localStorage check / hide state across refreshes.
  const items: Array<{
    id: string;
    item: string;
    qty: string;
    category: string;
    mealId: string;
    mealName: string;
    sentAt: string;
  }> = [];

  for (const row of rows ?? []) {
    const payload = (row.payload ?? {}) as MealPayload;
    const mealName = typeof payload.name === 'string' ? payload.name.trim() : '';
    const ingArr = Array.isArray(payload.ingredients) ? (payload.ingredients as IngredientLike[]) : [];
    for (let i = 0; i < ingArr.length; i++) {
      const ing = ingArr[i];
      let item = '';
      let qty = '';
      let category: string | undefined;
      if (typeof ing === 'string') {
        const parsed = parseIngredientString(ing);
        item = parsed.item;
        qty = parsed.qty;
      } else if (ing && typeof ing === 'object') {
        item = typeof ing.item === 'string' ? ing.item.trim() : '';
        qty = typeof ing.qty === 'string' ? ing.qty.trim() : '';
        if (typeof ing.category === 'string') category = ing.category;
      }
      if (!item) continue;
      const slug = item.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      items.push({
        id: `${row.id}::${slug}`,
        item,
        qty,
        category: category || guessCategory(item),
        mealId: row.id as string,
        mealName,
        sentAt: row.sent_at as string,
      });
    }
  }

  return NextResponse.json({ items });
}
