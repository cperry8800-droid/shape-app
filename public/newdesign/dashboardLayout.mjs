// Pure dashboard GRID-layout logic for the GridStack-based DashGrid. Reconciles a
// saved layout against the current widget set: keep saved x/y/w/h, add new widgets
// (auto-positioned), drop stale ones, filter hidden to declared keys. Mirrored inline
// in dashGrid.jsx (as dg*) — keep the two identical.

// size → GridStack column span on the 12-col grid (full row vs half).
export function widgetW(size) { return size === 'full' ? 12 : 6; }

// ⚠ A WIDGET DECLARES EMPTINESS; IT DOES NOT DISAPPEAR FROM THE LIST.
// Call sites used to write `flag ? { key, … } : null`, and that shape cannot work:
// DashGrid's boot effect is keyed on [role, tab], so the array it resolves a layout
// from is the one captured on the FIRST render — where every "is it loaded / is it
// live" flag is still false. A conditionally-omitted widget was therefore absent when
// the portal hosts were created, no host was ever made for it, and the card never
// mounted at all. So a widget with nothing to show stays in the array and sets
// `empty: true`; the grid adds and removes its item as the flag flips.
export function visibleWidgets(widgets) {
  return (widgets || []).filter((w) => w && !w.empty);
}

// saved: { items:[{id,x,y,w,h}], hidden:[id] } | null. widgets: [{ key, size, empty? }].
// Returns { visible:[{ key, x?, y?, w, h?, autoPosition? }], hidden:[key] }.
// Saved items keep their geometry; widgets with no saved entry are appended with
// autoPosition (GridStack packs them); a hidden key never appears in visible.
// ⚠ THE TWO FILTERS ARE DELIBERATELY DIFFERENT SETS. `hidden` is a member preference
// about a widget in this tab's catalogue, so it is filtered against every DECLARED
// key — an empty spell must not silently forget that they hid the card. Placement is
// filtered against the VISIBLE keys, because only a widget with something to show
// gets an item.
export function resolveGridLayout(saved, allWidgets) {
  const widgets = visibleWidgets(allWidgets);
  const bySize = {};
  widgets.forEach((w) => { bySize[w.key] = w.size; });
  const declared = new Set((allWidgets || []).filter(Boolean).map((w) => w.key));
  const existing = new Set(widgets.map((w) => w.key));
  // hidden: keep only declared keys, deduped (first occurrence wins).
  const hiddenSet = new Set(); const hidden = [];
  if (saved && Array.isArray(saved.hidden)) for (const k of saved.hidden) if (declared.has(k) && !hiddenSet.has(k)) { hidden.push(k); hiddenSet.add(k); }
  // saved items: keep only existing ids, deduped (first occurrence wins).
  const placed = new Set(); const savedItems = [];
  if (saved && Array.isArray(saved.items)) for (const i of saved.items) if (i && existing.has(i.id) && !placed.has(i.id)) { savedItems.push(i); placed.add(i.id); }
  const visible = [];
  for (const i of savedItems) {
    if (hiddenSet.has(i.id)) continue;
    visible.push({ key: i.id, x: i.x, y: i.y, w: i.w || widgetW(bySize[i.id]), h: i.h });
  }
  for (const w of widgets) {
    if (placed.has(w.key) || hiddenSet.has(w.key)) continue;
    visible.push({ key: w.key, w: widgetW(w.size), autoPosition: true });
  }
  return { visible, hidden };
}

// What to WRITE back to user_goals('dashboard_layout') after a layout change.
// live: what the grid currently holds (grid.save()). saved: what the doc holds today.
// declaredKeys: every widget key this tab declares, empty ones included.
// ⚠ A SAVED ARRANGEMENT IS PER DECLARED WIDGET, NOT PER RENDERED ITEM. `grid.save()`
// only reports items that exist right now, so writing it verbatim DELETES the member's
// placement for every card that happens to be empty at that moment — and the card then
// comes back auto-positioned at the bottom instead of where they left it. Entries for
// declared-but-absent keys are carried forward; entries for keys the tab no longer
// declares are dropped, so the document stays bounded by the widget catalogue.
export function mergeLayoutItems(live, saved, declaredKeys) {
  const declared = new Set(declaredKeys || []);
  const out = []; const seen = new Set();
  for (const i of (live || [])) {
    if (!i || i.id == null || seen.has(i.id)) continue;
    seen.add(i.id); out.push(i);
  }
  for (const i of ((saved && saved.items) || [])) {
    if (!i || i.id == null || seen.has(i.id) || !declared.has(i.id)) continue;
    seen.add(i.id); out.push(i);
  }
  return out;
}

// What the grid must ADD and REMOVE to be in step with the current widget array.
// currentKeys: the keys that have a grid item right now. lastPos: where a key sat
// when it was last removed. Returns { gone:[key], fresh:[{ key, spec }] } — the
// decision only; the caller does the DOM.
// ⚠ THE DECISION IS PURE SO IT CAN BE DRIVEN. The effect that applies it talks to
// GridStack and React portals, which no unit test here can stand up; if the choice
// of what to add, what to drop and WHERE a returning card lands lived inside it,
// none of that would be checkable except by eye.
export function planGridSync({ currentKeys, widgets, hidden, saved, lastPos }) {
  const hiddenSet = new Set(hidden || []);
  const want = visibleWidgets(widgets).filter((w) => !hiddenSet.has(w.key));
  const wantKeys = new Set(want.map((w) => w.key));
  const have = new Set(currentKeys || []);
  const gone = [...have].filter((k) => !wantKeys.has(k));
  const savedById = {};
  for (const i of ((saved && saved.items) || [])) if (i && i.id) savedById[i.id] = i;
  const fresh = [];
  for (const w of want) {
    if (have.has(w.key)) continue;
    // ⚠ LAST POSITION FIRST, SAVED SECOND. A card that empties and comes back
    // inside one session has a remembered position before anything is persisted;
    // preferring the saved document would drop it back to where it was at page
    // load, undoing a move the member made in between.
    const si = (lastPos && lastPos[w.key]) || savedById[w.key];
    fresh.push({
      key: w.key,
      spec: si
        ? { key: w.key, x: si.x, y: si.y, w: si.w || widgetW(w.size), h: si.h }
        : { key: w.key, w: widgetW(w.size), autoPosition: true },
    });
  }
  return { gone, fresh };
}
