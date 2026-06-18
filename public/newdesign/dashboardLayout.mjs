// Pure dashboard-layout logic — the single source of truth for resolving a saved
// widget layout against the current widget set, and for reordering. Mirrored inline
// in dashGrid.jsx (window.DashGrid, as dg*); keep the two identical.

// saved: { order:string[], hidden:string[] } | null. allKeys: the widget keys that
// exist NOW. defaultOrder: the default ordering of allKeys. Returns a layout that
// keeps the saved order (filtered to existing keys), appends any new keys (in
// defaultOrder sequence) so a future widget shows up, drops stale keys, and
// intersects hidden with existing keys.
export function resolveLayout(saved, allKeys, defaultOrder) {
  const all = new Set(allKeys);
  const savedOrder = (saved && Array.isArray(saved.order)) ? saved.order.filter((k) => all.has(k)) : [];
  const seen = new Set(savedOrder);
  const order = savedOrder.slice();
  for (const k of defaultOrder) if (all.has(k) && !seen.has(k)) { order.push(k); seen.add(k); }
  const hidden = (saved && Array.isArray(saved.hidden)) ? saved.hidden.filter((k) => all.has(k)) : [];
  return { order, hidden };
}

// Remove `key`, insert it immediately before `beforeKey` (or push to the end when
// `beforeKey` is null/absent). Moving a key onto itself is a no-op.
export function moveKey(order, key, beforeKey) {
  if (key === beforeKey) return order.slice();
  const next = order.filter((k) => k !== key);
  const idx = beforeKey == null ? -1 : next.indexOf(beforeKey);
  if (idx < 0) next.push(key); else next.splice(idx, 0, key);
  return next;
}

// Move `key` one slot earlier (dir < 0) or later (dir > 0); clamps at the ends.
export function stepKey(order, key, dir) {
  const i = order.indexOf(key);
  if (i < 0) return order.slice();
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= order.length) return order.slice();
  const next = order.slice();
  next.splice(i, 1);
  next.splice(j, 0, key);
  return next;
}
