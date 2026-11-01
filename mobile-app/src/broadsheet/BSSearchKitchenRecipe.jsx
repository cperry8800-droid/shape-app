import React from 'react';
import { bsSaveReceivedGroceryList, bsHasGroceryList, bsSaveReceivedGroceryListCoach, bsCoachHasGroceryList } from './BSGroceryShare.jsx';
import { bsReceivedGroceryId } from '../services/groceryShare.mjs';
// ─── A SHAPE KITCHEN RECIPE OPENED FROM SEARCH ───────────────────────────────────────────────────
// Its "Send to grocery list" did nothing: search mounted the recipe page with an empty handler,
// since search sits outside the Eat page, which holds the lists. It now saves the recipe's own list
// (bsSkRecipeGroceryList, the one the Eat page's Recipes tab builds) through the path a list sent in
// chat or a nutritionist's recipe takes (bsSaveReceivedGroceryList): the Eat page takes it when it
// is mounted, and otherwise it goes to this device's lists and the member's cloud document. A guest
// is asked for an account first; a list already saved reads as on the list.
// ⚠ A COACH'S LISTS ARE THEIR OWN (Codex P1 on #2559). Both coach apps open this search too, and a
// coach's Grocery Lists page reads coach_grocery_lists, not the member's Eat lists: saved there, the
// list read as saved and could not be found. A coach's copy goes to their own lists, as a list sent
// to them in chat does (bsSaveReceivedGroceryListCoach); the role is the one the chat reads.
// Its own module, not the client's (the worklog's rule for what a PR adds); search itself stays in
// the client, as it reads fourteen of the client's helpers that are not on window.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. This file is a static import of the
// client module, so it evaluates before that module's body has put BSShapeKitchenRecipe and
// bsSkRecipeGroceryList on window; a top-level read would capture undefined (React error #130).

const { useState, useMemo } = React;

// The i18n translator for this module (the self-contained copy every feature module carries).
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

export function BSSearchKitchenRecipe({ recipe, onBack }) {
  const { BSShapeKitchenRecipe, bsSkRecipeGroceryList, bsIsCoachRole } = window;
  const tr = useShapeTr();
  const list = useMemo(() => (bsSkRecipeGroceryList ? bsSkRecipeGroceryList(recipe) : null), [recipe]);
  const role = (() => { try { return window.ShapeAuth?.getCachedState?.()?.profile?.role || ''; } catch (e) { return ''; } })();
  const coach = !!(bsIsCoachRole && bsIsCoachRole(role));
  // A coach's copy is remembered by the id a list received in chat carries (one per source).
  const coachId = list ? bsReceivedGroceryId(list.id) : null;
  const [state, setState] = useState(() => (list && (coach ? bsCoachHasGroceryList(coachId) : bsHasGroceryList(list.id)) ? 'done' : null)); // null | 'busy' | 'done'
  const add = async () => {
    if (!list || state === 'busy' || state === 'done') return;
    if (window.bsRequireAccount && !window.bsRequireAccount(tr('profile:nutri.staplesAsk', { defaultValue: 'add to your grocery list' }))) return;
    setState('busy');
    try {
      if (coach) await bsSaveReceivedGroceryListCoach({ name: list.name, items: list.items.map((it) => ({ n: it.n, q: it.q })) }, { messageId: list.id });
      else await bsSaveReceivedGroceryList(list);
      setState('done');
      window.__bsToast?.(tr('nutrition:grocery.share.savedToast', { defaultValue: 'Saved to your grocery lists' }), 'ok');
    } catch (e) {
      setState(null);
      window.__bsToast?.(tr('nutrition:grocery.share.saveFail', { defaultValue: 'Could not save the list. Try again.' }), 'error');
    }
  };
  return <BSShapeKitchenRecipe recipe={recipe} onBack={onBack} onAddGrocery={add} groceryAdded={state === 'done'} />;
}
