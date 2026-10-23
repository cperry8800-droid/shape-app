// services/groceryShare.mjs
//
// Sending a grocery list to another member (owner, 2026-10-23: "I want to also create ability to send
// grocery lists to other shape members"). The list rides in a direct message, as the app's shared posts,
// channels and playlists already do: the body says what it is (the push and the inbox preview read it),
// and `metadata` carries the list itself, so the recipient's thread can draw it and save it to their own
// lists.
//
// ⚠ A RECEIVED LIST IS ANOTHER MEMBER'S INPUT. `messages.metadata` is free jsonb that any sender writes,
// so everything read back out of it is parsed here, strictly: strings only, trimmed and capped, a bounded
// number of items, anything else dropped. A message that does not parse draws no card.

export const BS_GROCERY_SHARE_KIND = 'grocery_list';
export const BS_GROCERY_SHARE_MAX_ITEMS = 150;
const MAX_NAME = 80;
const MAX_ITEM = 80;
const MAX_QTY = 24;
const MAX_AISLE = 40;

function clip(v, n) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, n);
}

// The list as the grocery page holds it ({ name, aisles: [{ aisle, items: [{ n, q }] }] }, or a flat
// `items`) → the items that travel: name, quantity, aisle. `keep` filters an item out (the page passes
// its skipped-meal test, so what is sent is what the sender's own list shows).
export function bsGroceryShareItems(list, keep = () => true) {
  const out = [];
  const push = (it, aisle) => {
    if (!it || out.length >= BS_GROCERY_SHARE_MAX_ITEMS || !keep(it)) return;
    const n = clip(it.n != null ? it.n : it.name, MAX_ITEM);
    if (!n) return;
    const row = { n };
    const q = clip(it.q != null ? it.q : it.quantity, MAX_QTY);
    if (q) row.q = q;
    const a = clip(aisle != null ? aisle : it.a, MAX_AISLE);
    if (a) row.a = a;
    out.push(row);
  };
  if (list && Array.isArray(list.aisles) && list.aisles.length) {
    for (const g of list.aisles) for (const it of (g && Array.isArray(g.items) ? g.items : [])) push(it, g.aisle);
  } else if (list && Array.isArray(list.items)) {
    for (const it of list.items) push(it, null);
  }
  return out;
}

// What the sender's app inserts: the body (English, as every shared-card body in the app is: it is the
// stored message, read by the push and the inbox preview, and worded for both ends of the thread) and the
// metadata the recipient's card reads.
export function bsGroceryShareMessage(list, keep) {
  const name = clip(list && list.name, MAX_NAME) || 'Grocery list';
  const items = bsGroceryShareItems(list, keep);
  if (!items.length) return null;
  return {
    body: `Grocery list: “${name}” · ${items.length} item${items.length === 1 ? '' : 's'}`,
    metadata: { kind: BS_GROCERY_SHARE_KIND, v: 1, name, items },
  };
}

// A message's metadata → { name, items } for the card, or null. The strict reader of another member's input.
export function bsGroceryFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || metadata.kind !== BS_GROCERY_SHARE_KIND) return null;
  const name = clip(metadata.name, MAX_NAME);
  const raw = Array.isArray(metadata.items) ? metadata.items.slice(0, BS_GROCERY_SHARE_MAX_ITEMS) : [];
  const items = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const n = clip(it.n, MAX_ITEM);
    if (!n) continue;
    const row = { n };
    const q = clip(it.q, MAX_QTY);
    if (q) row.q = q;
    const a = clip(it.a, MAX_AISLE);
    if (a) row.a = a;
    items.push(row);
  }
  if (!name || !items.length) return null;
  return { name, items };
}

// The id a saved copy carries: one per message, so saving the same message twice keeps one list.
export function bsReceivedGroceryId(messageId) {
  const s = String(messageId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return s ? `received-${s}` : null;
}

// A received list → one of the recipient's own lists, in the shape the Eat page keeps (`recipeLists`):
// a custom, editable list credited to the sender, its items flat (with ids) and grouped by aisle.
export function bsReceivedGroceryList(shared, { messageId, from, now = Date.now() } = {}) {
  if (!shared || !Array.isArray(shared.items) || !shared.items.length) return null;
  const id = bsReceivedGroceryId(messageId) || `received-${Math.random().toString(36).slice(2, 9)}`;
  const items = shared.items.map((it, i) => ({ id: `${id}-${i}`, n: it.n, q: it.q || '1', ...(it.a ? { a: it.a } : {}) }));
  const groups = [];
  for (const it of items) {
    const label = it.a || 'Items';
    let g = groups.find((x) => x.aisle === label);
    if (!g) { g = { aisle: label, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  const author = clip(from, MAX_NAME) || 'A Shape member';
  return {
    id, name: shared.name, kind: 'custom', editable: true,
    provenance: 'received', createdAt: now,
    author, authorSelf: false,
    note: '', usedCount: 0,
    preview: items.slice(0, 3).map((it) => it.n).join(' · '),
    count: items.length,
    items,
    aisles: groups,
  };
}
