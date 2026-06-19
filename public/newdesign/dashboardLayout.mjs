// Pure dashboard GRID-layout logic for the GridStack-based DashGrid. Reconciles a
// saved layout against the current widget set: keep saved x/y/w/h, add new widgets
// (auto-positioned), drop stale ones, filter hidden to existing keys. Mirrored inline
// in dashGrid.jsx (as dg*) — keep the two identical.

// size → GridStack column span on the 12-col grid (full row vs half).
export function widgetW(size) { return size === 'full' ? 12 : 6; }

// saved: { items:[{id,x,y,w,h}], hidden:[id] } | null. widgets: [{ key, size }].
// Returns { visible:[{ key, x?, y?, w, h?, autoPosition? }], hidden:[key] }.
// Saved items keep their geometry; widgets with no saved entry are appended with
// autoPosition (GridStack packs them); a hidden key never appears in visible.
export function resolveGridLayout(saved, widgets) {
  const bySize = {};
  widgets.forEach((w) => { bySize[w.key] = w.size; });
  const existing = new Set(widgets.map((w) => w.key));
  const hidden = (saved && Array.isArray(saved.hidden)) ? saved.hidden.filter((k) => existing.has(k)) : [];
  const hiddenSet = new Set(hidden);
  const savedItems = (saved && Array.isArray(saved.items)) ? saved.items.filter((i) => i && existing.has(i.id)) : [];
  const placed = new Set(savedItems.map((i) => i.id));
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
