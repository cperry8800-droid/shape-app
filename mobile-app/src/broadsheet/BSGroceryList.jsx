import React from 'react';
import { createPortal } from 'react-dom';
import { useBSClean, BSCleanType } from './bsCleanType.jsx';
import { bsTrainT } from './bsClientWeekDemo.js';
import { bsGrocerySkipped, bsGroceryByMeal, bsGroceryAisleStops, bsReadShopBy, bsSaveShopBy, bsReadSkippedMeals, bsSaveSkippedMeals, bsReadGotItems, bsSaveGotItems, bsToggleGot, bsGroceryCheckedKeys } from '../services/focusLayout.mjs';
// ─── GROCERY (Eat → Grocery: the shop list) ─────────────────────────────────────────────────────────
// The owner: "redesign this, its confusing, a little overwhelming", and of the three designs offered, C,
// the lit instrument (owner, 2026-11-04: "actually C for grocery list"), in the Library's grammar of LED
// count slots: what is left to get lit in a slot beside the list's name, the whole head in one framed slot
// ("include a bubble around this top part that matches C design"), the aisles as count slots, each item on
// one line with its meals after the name, the next aisle as a lit slot, the actions as lit chips. Prep the
// week comes after the list (shopping done, cooking next). The counts that said the same thing four times
// (89 items, 81 to get, Aisle 1 of 5, each aisle's figure on a strip) are one slot and one line now, and
// Add item is one bar: the item, the amount, a mic for the spoken list, and ＋. Moved out of
// iosAppBroadsheetClient.jsx with the redesign, as BSGroceryLibrary and BSLeaderboard were.
//
// Every function stays: the list picker and a new list, ticking and removing, More / In the cart, Aisle |
// Meal, skipping a meal, adding by hand or by voice, Instacart, Save to library, Share, Send to a member,
// the coach's sent list, Prep the week.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. The client module imports this file, so
// it evaluates before that module's body has put its pieces on window; a top-level read would capture
// undefined (React error #130). Each component names the globals it needs on its first line. This file
// never imports the client module back.

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

// A colour at an alpha (the client's bsTHexA, copied: this module never imports it).
const bsGlA = (hex, a) => { const h = String(hex || '#888888').replace('#', ''); const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h; const n = parseInt(s, 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

// Item-swap suggestions for a coach-sent grocery item — a keyword map + a
// category fallback so the member can sub anything for a sensible alternative.
const BS_GRO_SWAPS = {
  'white rice': ['Brown rice', 'Quinoa', 'Cauliflower rice'],
  'rice': ['Brown rice', 'Quinoa', 'Jasmine rice'],
  'chicken breast': ['Chicken thigh', 'Turkey breast', 'Extra-firm tofu'],
  'chicken': ['Turkey', 'Tofu', 'Tempeh'],
  'beef': ['Lean ground beef', 'Bison', 'Turkey'],
  'salmon': ['Trout', 'Cod', 'Canned tuna'],
  'milk': ['Almond milk', 'Oat milk', 'Lactose-free milk'],
  'greek yogurt': ['Skyr', 'Cottage cheese', 'Plant-based yogurt'],
  'yogurt': ['Greek yogurt', 'Skyr', 'Plant-based yogurt'],
  'bread': ['Whole-grain bread', 'Sourdough', 'Wraps'],
  'pasta': ['Whole-wheat pasta', 'Chickpea pasta', 'Rice noodles'],
  'potato': ['Sweet potato', 'Butternut squash', 'Parsnip'],
  'spinach': ['Kale', 'Arugula', 'Swiss chard'],
  'peanut butter': ['Almond butter', 'Sunflower butter', 'Cashew butter'],
};
function bsGrocerySwap(name) {
  const { bsGroceryAisleFor } = window;
  const n = String(name || '').toLowerCase().trim();
  for (const k in BS_GRO_SWAPS) if (n.includes(k)) return BS_GRO_SWAPS[k].filter(x => x.toLowerCase() !== n);
  const cat = bsGroceryAisleFor(name);
  const FB = {
    Produce: ['Seasonal greens', 'Frozen mixed veg', 'A different vegetable'],
    Protein: ['Tofu', 'Turkey', 'Eggs'],
    Dairy: ['Plant-based alt', 'Low-fat version', 'Lactose-free version'],
    Grains: ['Brown rice', 'Quinoa', 'Oats'],
  };
  return FB[cat] || ['A similar item', 'Store-brand version', 'Skip this item'];
}

// "From your nutritionist" review card — the coach-pushed grocery list, where the
// member reviews each item and can SWAP it for an alternative before adding it to
// their own grocery list. Reads coach_pushed_items via /api/client/grocery.
function BSCoachGroceryReview({ t, teal, onAdd }) {
  const { ShapeClientGrocery } = window;
  const tr = useShapeTr();
  const [groups, setGroups] = React.useState(null);
  const [swapKey, setSwapKey] = React.useState(null); // `${gi}-${ii}`
  const [added, setAdded] = React.useState({});
  // ⚠ THE RECORD TOKEN AND THE HEADING LABEL ARE TWO DIFFERENT STRINGS ON PURPOSE.
  // An unnamed group keys on '' (see below) — but `onAdd` writes the group's source
  // onto every added grocery item as its provenance subtitle, and that is a RECORD
  // value, not copy: translating it would freeze one language into the member's own
  // list (the record-shape rule this wave already paid for). So the record carries
  // the canonical English token while the heading renders the translated label.
  const SOURCE_UNNAMED = 'Coach list';
  React.useEffect(() => {
    let on = true;
    if (!ShapeClientGrocery?.list) { setGroups([]); return () => { on = false; }; }
    ShapeClientGrocery.list().then(items => {
      if (!on) return;
      if (!Array.isArray(items) || !items.length) { setGroups([]); return; }
      const by = {};
      // ⚠ THE GROUP KEY STAYS RAW AND THE FALLBACK NAME IS MADE AT RENDER. This
      // grouped on the literal 'Coach list', so translating it here would make the
      // key itself locale-dependent — the same shape as the aisle token, one
      // component over. An unnamed group keys on '' and is named below.
      items.forEach(it => { const g = String(it.mealName || '').trim(); (by[g] = by[g] || []).push({ item: it.item, qty: it.qty || '', id: it.id }); });
      setGroups(Object.keys(by).map(name => ({ name, source: name || SOURCE_UNNAMED, items: by[name] })));
    }).catch(() => { if (on) setGroups([]); });
    return () => { on = false; };
  }, []);
  if (!groups || !groups.length) return null;
  const muted = t.INK50;
  const card = t.SURFACE || t.PAPER2;
  const setItem = (gi, ii, val) => setGroups(gs => gs.map((g, x) => x !== gi ? g : { ...g, items: g.items.map((it, y) => y !== ii ? it : { ...it, item: val }) }));
  return (
    <div style={{ padding: `0 ${t.padX}px 6px` }}>
      {groups.map((g, gi) => (
        <div key={gi} style={{ border: `1px solid ${teal}55`, borderRadius: 18, background: card, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: 3, background: teal }} />
          <div style={{ padding: '13px 15px 15px' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, fontWeight: 900 }}>{tr('nutrition:grocery.coach.from', { defaultValue: 'From your nutritionist' })}</div>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: t.INK }}>{g.name || tr('nutrition:grocery.coach.unnamed', { defaultValue: 'Coach list' })}</div>
            <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted }}>{tr('nutrition:grocery.coach.reviewCount', { defaultValue: `${g.items.length} item${g.items.length === 1 ? '' : 's'} · review & swap before adding`, count: g.items.length })}</div>
            <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {g.items.map((it, ii) => {
                const k = `${gi}-${ii}`;
                const open = swapKey === k;
                const alts = open ? bsGrocerySwap(it.item) : [];
                return (
                  <div key={ii}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: ii ? `1px solid ${t.RULE}` : 'none' }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK }}>{it.item}{it.qty ? <span style={{ color: muted, fontSize: 12 }}> · {it.qty}</span> : null}</span>
                      <button onClick={() => setSwapKey(open ? null : k)} style={{ flex: 'none', border: `1px solid ${open ? teal : t.RULE}`, background: open ? `${teal}1f` : 'transparent', color: open ? teal : t.INK70, borderRadius: 999, padding: '5px 11px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('nutrition:grocery.coach.swap', { defaultValue: '⇄ Swap' })}</button>
                    </div>
                    {open && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 0 10px 2px' }}>
                        {alts.map(a => (
                          <button key={a} onClick={() => { setItem(gi, ii, a); setSwapKey(null); window.__bsToast?.(tr('nutrition:grocery.coach.swapped', { defaultValue: `Swapped to ${a}`, item: a }), 'ok'); }} style={{ border: `1px solid ${t.RULE}`, background: t.PAPER, color: t.INK, borderRadius: 999, padding: '6px 11px', fontFamily: t.DISPLAY, fontSize: 12.5, cursor: 'pointer' }}>{a}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              disabled={!!added[gi]}
              onClick={() => { onAdd(g); setAdded(a => ({ ...a, [gi]: true })); window.__bsToast?.(tr('nutrition:grocery.coach.added', { defaultValue: 'Added to your grocery list' }), 'ok'); }}
              style={{ width: '100%', marginTop: 13, padding: '12px', borderRadius: 999, border: 0, background: added[gi] ? t.RULE : teal, color: added[gi] ? t.INK50 : '#04201d', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: added[gi] ? 'default' : 'pointer' }}>
              {added[gi]
                ? tr('nutrition:grocery.coach.addedTick', { defaultValue: '✓ Added to your list' })
                : tr('nutrition:grocery.coach.addCta', { defaultValue: 'Add to my grocery list →' })}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── The LED slot, the grammar of this page (the Library's count slots): a dark inset slot on the dark
// paper and a faint ink wash on the light one, a 1px frame tinted to its colour (stronger when lit), the
// inset shadow, mono figures that glow on the dark paper only.
function bsGlLed(t, c, on = true) {
  return {
    boxSizing: 'border-box', borderRadius: 9,
    background: t.isLight ? bsGlA(t.INK, 0.05) : 'rgba(0,0,0,0.45)',
    boxShadow: bsGlLedShadow(t),
    border: `1px solid ${bsGlA(c, on ? 0.45 : 0.16)}`,
  };
}
const bsGlLedShadow = (t) => (t.isLight ? 'inset 0 1px 3px rgba(0,0,0,0.12)' : 'inset 0 1px 4px rgba(0,0,0,0.6)');
const bsGlGlow = (t, c, a = 0.7) => (t.isLight ? {} : { textShadow: `0 0 10px ${bsGlA(c, a)}` });

// Shop by: Aisle | Meal — two lit slots at the right of the label, the chosen one framed and glowing.
function GroceryShopBy({ value, onChange, label, aisleLabel, mealLabel, accent }) {
  const { useBS } = window;
  const t = useBS();
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
      <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{label}</span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
        {[['aisle', aisleLabel], ['meal', mealLabel]].map(([k, l]) => {
          const on = (value === 'meal' ? 'meal' : 'aisle') === k;
          return (
            <button type="button" key={k} aria-pressed={on} onClick={() => onChange(k)} style={{ ...bsGlLed(t, on ? accent : t.INK, on), boxShadow: on && !t.isLight ? `${bsGlLedShadow(t)}, 0 0 12px ${bsGlA(accent, 0.2)}` : bsGlLedShadow(t), minHeight: 44, minWidth: 76, padding: '0 14px', borderRadius: 8, cursor: 'pointer', color: on ? accent : t.INK70, ...(on ? bsGlGlow(t, accent, 0.6) : {}), fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{l}</button>
          );
        })}
      </span>
    </div>
  );
}

// The aisles as LED count slots, five to a row: what is left in each glowing (✓ when it is all got), its
// name under it; the aisle you are in is lit. `stops` are { key, label, left, on, onSelect, ariaLabel }.
function GroceryAisleSlots({ stops, accent }) {
  const { useBS } = window;
  const t = useBS();
  const cols = Math.min(stops.length, 5);
  return (
    <div data-grocery-aisles="" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 7, marginTop: 12 }}>
      {stops.map((s) => {
        const fin = s.left === 0;
        return (
          <button key={s.key} type="button" aria-pressed={s.on} aria-label={s.ariaLabel} onClick={s.onSelect} style={{ ...bsGlLed(t, s.on ? accent : t.INK, s.on), boxShadow: s.on && !t.isLight ? `${bsGlLedShadow(t)}, 0 0 14px ${bsGlA(accent, 0.22)}` : bsGlLedShadow(t), minHeight: 58, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 3px', cursor: 'pointer' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 19, fontWeight: 700, lineHeight: 1, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', color: s.on ? accent : fin ? t.INK50 : t.INK, ...(s.on ? bsGlGlow(t, accent) : {}) }}>{fin ? '✓' : s.left}</span>
            <span style={{ maxWidth: '100%', fontFamily: t.MONO, fontSize: 6.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.on ? accent : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function BSGrocery({ list: activeList, planList = null, onBack, onLibrary, recipeLists = [], onChangeView = () => {}, editable = false, onUpdate = () => {}, onCreate = () => {}, onSaveToLibrary = null, onPickList = null, onProfile = () => {}, onPrep = null, mealWhen = null }) {
  const { useBS, BSPage, BSPageHeader, BSHeaderTools, BSNutritionTopTabs, BSFooter, BSPostSendSheet, _bsScrollTopOnMount, bsGroceryHues, bsDateLocale, bsAisleLabel, bsGroceryAisleFor, bsNormalizeGroceryList, useBSLibrary, bsLibToggle } = window;
  const t = useBS();
  // The page under the Eat · Grocery tabs is in the clean type, as Day is (owner, 2026-10-29: "Yes", to
  // moving Grocery and the Library off Saira): Geist heads and Inter Tight words. The header, the tabs and
  // the sheets (the list picker, Send to a member) keep the app's own type, as on Day.
  const tc = useBSClean();
  const trG = useShapeTr();
  const TG = bsTrainT(trG);
  _bsScrollTopOnMount();
  const list = bsNormalizeGroceryList(activeList);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false); // Send to a member (owner, 2026-10-23)
  const [newName, setNewName] = React.useState('');
  const [newQty, setNewQty] = React.useState('');
  const addItem = () => {
    const n = newName.trim();
    if (!n) return;
    const item = { id: `${list.id || 'list'}-i-${Date.now()}`, n, q: newQty.trim() || '1', meals: list.name };
    const aisles = (list.aisles && list.aisles.length)
      ? list.aisles.map(a => ({ ...a, items: [...a.items] }))
      : [{ aisle: 'Items', items: [] }];
    aisles[0] = { ...aisles[0], items: [...aisles[0].items, item] };
    onUpdate({ ...list, aisles });
    setAisleAt(0);   // walk to the aisle the new item landed in
    setNewName(''); setNewQty('');
  };
  const removeItem = (ai, ii) => {
    const aisles = list.aisles.map((a, idx) => idx === ai ? { ...a, items: a.items.filter((_, j) => j !== ii) } : a);
    onUpdate({ ...list, aisles });
  };
  const allKeys = [];
  list.aisles.forEach((a, ai) => a.items.forEach((it, ii) => allKeys.push({ k: `${ai}-${ii}`, have: !!it.have })));
  // THE TICKS ARE REMEMBERED PER LIST (owner, 2026-10-11, the shop list on each
  // meal): the Eat page ticks the same items, by name, so one tick is one tick
  // on both pages and survives leaving this one. Nothing remembered yet → the
  // list's own defaults (a pantry staple starts got).
  // The state holds the got NAMES; the ticked rows are worked out from them on
  // every render, so when another device's edit lands while this list is open
  // (an item added in front, one removed, the order changed) each tick stays on
  // its item instead of on the row it used to be in.
  const _gStore = (typeof window !== 'undefined' && window.localStorage) || null;
  const _gListKey = String(list.id || list.name || 'list');
  const [gotNames, setGotNames] = React.useState(() => bsReadGotItems(_gStore, _gListKey));
  React.useEffect(() => {
    setGotNames(bsReadGotItems(_gStore, _gListKey));
  }, [_gListKey]);
  const checked = bsGroceryCheckedKeys(list.aisles, gotNames);
  const toggle = (k) => {
    const [ai, ii] = String(k).split('-').map(Number);
    const item = list.aisles[ai] && list.aisles[ai].items[ii];
    if (!item) return;
    const next = bsToggleGot(list.aisles, gotNames, item);
    setGotNames(next);
    bsSaveGotItems(_gStore, _gListKey, next);
  };
  // ── SHOP BY (owner, 2026-10-11): the same list two ways — by aisle for the
  // store (one aisle at a time), or by meal for the week (each ingredient under
  // the meal it is for, and a meal can be skipped). One tick is one tick in
  // both views. The choice and the skipped meals are remembered on this device.
  const _store = (typeof window !== 'undefined' && window.localStorage) || null;
  const [shopBy, setShopByState] = React.useState(() => bsReadShopBy(_store));
  const setShopBy = (v) => { setShopByState(v); bsSaveShopBy(_store, v); };
  const listKey = String(list.id || list.name || 'list');
  const [skipped, setSkipped] = React.useState(() => bsReadSkippedMeals(_store, listKey));
  const [aisleAt, setAisleAt] = React.useState(null);      // the aisle being walked (index), null = the first with anything left
  const [aisleAll, setAisleAll] = React.useState(false);   // show every item still to get in that aisle
  const [cartOpen, setCartOpen] = React.useState(false);   // show what is already in the cart there
  const [openMeals, setOpenMeals] = React.useState(null);  // meals shown open; null = the first two
  const [mealsAll, setMealsAll] = React.useState(false);   // every meal, not just the next six
  React.useEffect(() => {
    setSkipped(bsReadSkippedMeals(_store, listKey));
    setAisleAt(null); setAisleAll(false); setCartOpen(false); setOpenMeals(null); setMealsAll(false);
  }, [listKey]);
  const toggleSkip = (name) => setSkipped((prev) => {
    const n = new Set(prev);
    if (n.has(name)) n.delete(name); else n.add(name);
    bsSaveSkippedMeals(_store, listKey, n);
    return n;
  });
  const isGot = (ai, ii) => checked.has(`${ai}-${ii}`);
  // A skipped item (every meal it is for was skipped) is off the list: out of the
  // counts, the aisles, the share text and the Instacart order.
  const liveKeys = [];
  list.aisles.forEach((a, ai) => a.items.forEach((it, ii) => { if (!bsGrocerySkipped(it, skipped)) liveKeys.push(`${ai}-${ii}`); }));
  const total = liveKeys.length;
  const done = liveKeys.filter((k) => checked.has(k)).length;
  const left = total - done;
  const offCount = allKeys.length - total;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const { teal, gold } = bsGroceryHues(t);
  const savedLib = useBSLibrary();
  // ⚠ `meta` STAYS ENGLISH, AND THAT IS THE RECORD-SHAPE RULE, NOT AN OMISSION.
  // It is WRITTEN INTO the saved-library record (bsLibToggle → shape.library +
  // the cloud doc), so translating it here would freeze one language into the
  // member's own data — the exact fault the grocery eyebrow cut closed. The
  // honest fix is the same token/render split, but `meta` is a LIBRARY field
  // with four writers (workout · meal · plan · grocery) and three readers, so
  // doing it at this one writer would split one column into two conventions.
  // Registered as its own cut; see docs/WORKLOG.md.
  const groceryItem = { id: `grocery:${list.id || String(list.name || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`, kind: 'grocery', title: list.name, meta: `${allKeys.length} items · ${list.aisles.length} aisles` };
  const grocerySaved = savedLib.some(x => x.id === groceryItem.id);
  const accent = teal; // grocery (food list) page leads with the client teal accent
  // The ink on a teal fill: white on the light paper, the deep teal on the dark one (white on #34d6c5
  // does not read).
  const onAccent = t.isLight ? '#fff' : '#04201d';
  const saveToLib = () => { if (onSaveToLibrary) onSaveToLibrary(list); else bsLibToggle(groceryItem); };
  const shareList = async () => {
    // ⚠ toUpperCase() IS LOCALE-INSENSITIVE and this now runs over translated
    // text — the Turkish dotted/dotless i class this repo has already paid for.
    const lines = list.aisles.map(a => ({ ...a, items: a.items.filter(it => !bsGrocerySkipped(it, skipped)) })).filter(a => a.items.length).map(a => `${bsAisleLabel(a.aisle, TG).toLocaleUpperCase(bsDateLocale())}\n${a.items.map(it => `  • ${it.q ? it.q + ' ' : ''}${it.n}`).join('\n')}`).join('\n\n');
    const shopTitle = TG('nutrition:grocery.shop.shareTitle', `${list.name} — Shop list`, { name: list.name });
    const body = `${shopTitle}\n\n${lines}`;
    // Native share sheet (Messages / Mail / etc.) when available, else clipboard.
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: shopTitle, text: body });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; /* fall through to copy */ }
    try { await navigator.clipboard?.writeText(body); window.__bsToast?.(TG('nutrition:grocery.shop.copied', 'Shop list copied — paste to share'), 'ok'); }
    catch (e) { window.__bsToast?.(TG('nutrition:grocery.shop.shareFail', 'Could not share the list'), 'err'); }
  };
  const sendInstacart = async () => {
    try {
      const items = (list.aisles || []).flatMap(a => (a.items || []).filter(it => !bsGrocerySkipped(it, skipped))).map(it => ({ name: it.n, display_text: [it.q, it.n].filter(Boolean).join(' ') })).filter(it => it.name);
      if (!items.length) { window.__bsToast?.(TG('nutrition:grocery.shop.emptySend', 'Your grocery list is empty.'), 'error'); return; }
      await window.ShapeIntegrations?.sendGroceryToInstacart?.({ items, title: list.name });
    } catch (e) { window.__bsToast?.(e?.message || TG('nutrition:grocery.shop.sendFail', 'Could not send list.'), 'error'); }
  };
  // ── Voice add — speak the whole list ("chicken, 2 lbs of rice, olive oil…"),
  // transcribe via /api/nutrition/voice (Whisper), parse into items and drop
  // each into its aisle — no typing item by item.
  const [vState, setVState] = React.useState('idle'); // 'idle' | 'rec' | 'busy'
  const vRef = React.useRef({ rec: null, chunks: [], stream: null });
  React.useEffect(() => () => { try { vRef.current.stream && vRef.current.stream.getTracks().forEach((track) => track.stop()); } catch (e) {} }, []);
  const bsParseSpokenItems = (text) => String(text || '')
    .split(/,| and | plus |\n|;/i)
    .map((s) => s.trim().replace(/^(add|get|buy|grab|some|a|an)\s+/i, '').replace(/[.!?]+$/, ''))
    .filter((s) => s.length > 1)
    .map((part) => {
      const m = part.match(/^(\d+(?:\.\d+)?\s*(?:x|lbs?|kg|g|oz|cans?|bags?|bunch(?:es)?|box(?:es)?|bottles?|cartons?|packs?|jars?|loaves?|loaf|dozen|ct)?)\s+(?:of\s+)?(.+)$/i);
      return m ? { q: m[1].trim(), n: m[2].trim() } : { q: '1', n: part };
    });
  const addSpokenItems = (items) => {
    if (!items.length) { window.__bsToast?.(TG('nutrition:grocery.shop.voiceNone', 'Didn’t catch any items — try again'), 'err'); return; }
    const aisles = (list.aisles && list.aisles.length) ? list.aisles.map(a => ({ ...a, items: [...a.items] })) : [];
    const findAisle = (name) => { const al = bsGroceryAisleFor(name); let idx = aisles.findIndex(a => a.aisle === al); if (idx < 0) { aisles.push({ aisle: al, items: [] }); idx = aisles.length - 1; } return idx; };
    items.forEach((it, n2) => { const ai = findAisle(it.n); aisles[ai].items.push({ id: `voice-${Date.now()}-${n2}`, n: it.n, q: it.q, meals: list.name, have: false }); });
    onUpdate({ ...list, aisles });
    const _touched = new Set(items.map((it) => bsGroceryAisleFor(it.n)));   // walk to the first aisle the spoken items landed in
    const _firstAi = aisles.findIndex((a) => _touched.has(a.aisle));
    if (_firstAi >= 0) setAisleAt(_firstAi);
    window.__bsToast?.(TG('nutrition:grocery.shop.voiceAdded', `Added ${items.length} item${items.length === 1 ? '' : 's'} from voice`, { count: items.length }), 'ok');
  };
  const voiceTap = async () => {
    if (vState === 'busy') return;
    const v = vRef.current;
    if (vState === 'rec') { try { v.rec && v.rec.stop(); } catch (e) {} return; }
    if (!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined')) {
      window.__bsToast?.(TG('nutrition:log.errVoiceUnsupported', 'Voice input isn’t supported here yet'), 'err'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      v.stream = stream; v.rec = rec; v.chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) v.chunks.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(v.chunks, { type: rec.mimeType || 'audio/webm' });
        try { v.stream && v.stream.getTracks().forEach((track) => track.stop()); } catch (e) {}
        v.stream = null; v.rec = null; v.chunks = [];
        if (!(blob.size > 0)) { setVState('idle'); return; }
        setVState('busy');
        try {
          // The backend client (apiBaseUrl + Bearer), with the app's locale and
          // the grocery vocabulary — see the meal logger's dictate().
          const stt = window.ShapeSupport && window.ShapeSupport.transcribeNote;
          if (!stt) throw new Error(TG('nutrition:log.errVoiceUnsupported', 'Voice input isn’t supported here yet'));
          const r = await stt(blob, { filename: 'list.webm', context: 'grocery', language: window.ShapeLocale?.get?.() });
          if (!r.ok) throw new Error(r.error || TG('nutrition:log.errTranscribe', 'Could not transcribe'));
          addSpokenItems(bsParseSpokenItems(r.transcript));
        } catch (e) { window.__bsToast?.(e?.message || TG('nutrition:grocery.shop.voiceFail', 'Voice add failed'), 'err'); }
        finally { setVState('idle'); }
      };
      rec.start();
      setVState('rec');
    } catch (e) { window.__bsToast?.(TG('nutrition:grocery.shop.micFail', 'Microphone unavailable'), 'err'); setVState('idle'); }
  };

  // ── What the page draws ──
  const mono = (size, color, extra = {}) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', ...(color !== undefined ? { color } : {}), ...extra });
  const led = (c, on = true) => bsGlLed(t, c, on);
  const glow = (c, a) => bsGlGlow(t, c, a);
  const ledShadow = bsGlLedShadow(t);
  const inCartOf = trG('nutrition:grocery.shop.inCartOf', { defaultValue: '{done} of {total} in the cart', done, total });
  const toGetN = (n) => trG('nutrition:grocery.shop.toGetCount', { defaultValue: '{count} to get', count: n });
  const allGotWord = trG('nutrition:grocery.shop.aisleDone', { defaultValue: 'All got ✓' });
  const chev = <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5 5 6.5 8 3.5" /></svg>;
  // The list's source, named (the dot used to be a colour with no word); its colour tints the head's frame,
  // as each kind's colour tints its slot in the Library.
  const src = list.kind === 'recipe' ? { c: t.AMBER, l: TG('nutrition:grocery.shop.srcRecipe', 'Recipe') }
    : list.kind === 'custom' ? { c: '#8a5cf6', l: TG('nutrition:grocery.shop.srcCustom', 'Custom') }
      : list.kind === 'mealplan' ? { c: gold, l: TG('nutrition:grocery.shop.srcMealPlan', 'Meal plan') }
        : { c: gold, l: TG('nutrition:grocery.shop.srcPlan', 'Nutri plan') };
  const skippedNote = offCount > 0 ? <span style={{ color: gold }}>{trG('nutrition:grocery.shop.offCount', { defaultValue: '{count} skipped', count: offCount })}</span> : null;
  // The head's slot sets the figure large and its words small, read off the one translated count and kept
  // in its order ("81 to get" sets the words under the figure; a locale that leads with the words sets them
  // above), the Library's way (Codex P2 on #2447). The figure is the whole localized number.
  const leftParts = String(toGetN(left)).match(/^(.*?)(\d+(?:[.,\s  '’]\d+)*)(.*)$/);
  const leftFig = leftParts ? leftParts[2] : String(left);
  const leftBefore = leftParts ? leftParts[1].trim() : '';
  const leftAfter = leftParts ? leftParts[3].trim() : '';
  const slotWord = (w, below) => <span style={mono(6.5, t.INK50, { [below ? 'marginTop' : 'marginBottom']: 3, maxWidth: 54, letterSpacing: '0.1em', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>{w}</span>;

  // One item on the list — the same row in both views, on one line: a lit tick
  // slot, the name with its meals after it (the aisle view only; in the meal view
  // the meal is the group), the amount, and × on a list the member can edit.
  const itemRow = (ai, ii, it, { compact = false, first = false } = {}) => {
    const k = `${ai}-${ii}`; const on = checked.has(k);
    return (
      <div key={k} role="checkbox" aria-checked={on} tabIndex={0} onClick={() => toggle(k)}
        onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(k); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '6px 0', boxSizing: 'border-box', cursor: 'pointer', borderTop: first ? 0 : `1px solid ${t.HAIR}`, opacity: on ? 0.5 : 1 }}>
        <span aria-hidden style={{ ...led(accent, on), flexShrink: 0, width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, color: accent, ...glow(accent) }}>{on ? '✓' : ''}</span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, overflow: 'hidden' }}>
          <span style={{ flexShrink: 0, maxWidth: '72%', fontFamily: tc.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: t.INK, textDecoration: on ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.n}</span>
          {!compact && it.meals ? <span style={{ minWidth: 0, fontFamily: tc.BODY, fontSize: 12, color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.meals}</span> : null}
        </span>
        <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: accent, ...glow(accent, 0.5), whiteSpace: 'nowrap' }}>{it.q}</span>
        {editable && <button type="button" onClick={(e) => { e.stopPropagation(); removeItem(ai, ii); }} aria-label={TG('nutrition:log.remove', 'Remove')} style={{ flexShrink: 0, border: 0, background: 'transparent', color: t.INK50, fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0, minWidth: 30, minHeight: 44 }}>×</button>}
      </div>
    );
  };
  const quietBtn = (extra = {}) => ({ width: '100%', minHeight: 46, display: 'flex', alignItems: 'center', gap: 10, padding: 0, background: 'transparent', border: 0, borderTop: `1px solid ${t.HAIR}`, cursor: 'pointer', textAlign: 'left', ...extra });

  // BY AISLE — one aisle at a time: the aisles as LED count slots with what is
  // left in each, then the aisle you are in (the first eight still to get, the
  // rest a tap away, what is already in the cart there folded), and the next
  // aisle with anything left as a lit slot.
  const byAisle = (() => {
    if (shopBy === 'meal') return null;
    const stops = bsGroceryAisleStops(list.aisles, isGot, skipped);
    const cur = stops.find((s) => s.ai === aisleAt) || stops.find((s) => s.left > 0) || stops[0] || null;
    if (!cur) return null;
    const labelOf = (ai) => bsAisleLabel(list.aisles[ai].aisle, TG);
    const label = labelOf(cur.ai);
    const items = list.aisles[cur.ai].items.map((it, ii) => ({ it, ii })).filter((x) => !bsGrocerySkipped(x.it, skipped));
    const toGet = items.filter((x) => !isGot(cur.ai, x.ii));
    const inCart = items.filter((x) => isGot(cur.ai, x.ii));
    const CAP = 8;
    const shown = aisleAll ? toGet : toGet.slice(0, CAP);
    const pos = stops.indexOf(cur);
    const next = stops.slice(pos + 1).find((s) => s.left > 0) || stops.slice(0, pos).find((s) => s.left > 0) || null;
    const go = (ai) => { setAisleAt(ai); setAisleAll(false); setCartOpen(false); };
    return (
      <>
        {stops.length > 1 && (
          <GroceryAisleSlots accent={accent} stops={stops.map((s) => ({
            key: `${s.ai}`, label: labelOf(s.ai), left: s.left, on: s.ai === cur.ai, onSelect: () => go(s.ai),
            ariaLabel: trG('nutrition:grocery.shop.aisleStopAria', { defaultValue: '{aisle}: {count} to get', aisle: labelOf(s.ai), count: s.left }),
          }))} />
        )}
        <div data-grocery-aisle="" style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: 6, borderBottom: `1px solid ${t.RULE}` }}>
          <span style={{ minWidth: 0, fontFamily: tc.HEAD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <span style={mono(9, accent, { letterSpacing: '0.12em', whiteSpace: 'nowrap', ...glow(accent, 0.5) })}>{toGet.length ? toGetN(toGet.length) : allGotWord}</span>
        </div>
        {shown.map((x, i) => itemRow(cur.ai, x.ii, x.it, { first: i === 0 }))}
        {toGet.length > CAP && (
          <button type="button" onClick={() => setAisleAll((v) => !v)} aria-expanded={aisleAll} style={quietBtn(mono(9, accent))}>
            {aisleAll ? trG('nutrition:grocery.shop.showFewer', { defaultValue: 'Show fewer ▴' }) : trG('nutrition:grocery.shop.moreInAisle', { defaultValue: '{count} more in {aisle} ▾', count: toGet.length - CAP, aisle: label })}
          </button>
        )}
        {inCart.length > 0 && (
          <>
            <button type="button" onClick={() => setCartOpen((v) => !v)} aria-expanded={cartOpen} style={quietBtn()}>
              <span aria-hidden style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, background: accent, color: onAccent, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800 }}>✓</span>
              <span style={{ minWidth: 0, flex: 1, fontFamily: tc.BODY, fontSize: 12.5, color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {trG('nutrition:grocery.shop.inCart', { defaultValue: '{count} in the cart', count: inCart.length })} · <span style={{ color: t.INK70 }}>{inCart.map((x) => x.it.n).join(', ')}</span>
              </span>
              <span aria-hidden style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>{cartOpen ? '▴' : '▾'}</span>
            </button>
            {cartOpen && inCart.map((x, i) => itemRow(cur.ai, x.ii, x.it, { first: i === 0 }))}
          </>
        )}
        {next ? (
          <button type="button" data-grocery-next="" onClick={() => go(next.ai)} style={quietBtn({ minHeight: 60, gap: 12 })}>
            <span style={{ ...led(t.INK, false), flexShrink: 0, width: 44, height: 40, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 15, fontWeight: 700, color: t.INK }}>{next.left}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={mono(7.5, accent, { display: 'block', letterSpacing: '0.18em', ...glow(accent, 0.5) })}>{trG('nutrition:grocery.shop.nextAisle', { defaultValue: 'Next aisle' })}</span>
              <span style={{ display: 'block', marginTop: 2, fontFamily: tc.HEAD, fontSize: 16, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelOf(next.ai)}</span>
            </span>
            <span aria-hidden style={{ flexShrink: 0, color: accent, fontSize: 16, fontWeight: 700, ...glow(accent) }}>→</span>
          </button>
        ) : (stops.every((s) => s.left === 0) ? (
          <div style={{ marginTop: 14, ...mono(9, accent) }}>{trG('nutrition:grocery.shop.allGot', { defaultValue: 'Everything is in the cart ✓' })}</div>
        ) : null)}
      </>
    );
  })();

  // BY MEAL — each ingredient under the meal it is for, in the order the
  // meals come this week (today first). An ingredient for two meals sits under
  // both, and a tick in one is a tick in the other. Skip a meal and its
  // ingredients come off the list, unless another meal still needs them. Items
  // that are not for a meal gather at the end. What a meal has got reads in its
  // own lit slot (lit through when all of it is got).
  const byMeal = (() => {
    if (shopBy !== 'meal') return null;
    // A custom list's own items carry the list's name as their "meal" — they
    // are for no meal, so they gather with the loose items.
    const forMeal = list.aisles.map((a) => ({ ...a, items: a.items.map((it) => (it.meals === list.name ? { ...it, meals: '', mealList: undefined } : it)) }));
    const when = (name) => (mealWhen && typeof mealWhen.get === 'function' ? mealWhen.get(name) : null) || null;
    const groups = bsGroceryByMeal(forMeal, (name) => { const w = when(name); return w ? w.rank : null; });
    const named = groups.filter((g) => g.name);
    const firstOpen = new Set(named.filter((g) => !skipped.has(g.name)).slice(0, 2).map((g) => g.name));
    const isOpen = (name) => (openMeals || firstOpen).has(name);
    const flip = (name) => setOpenMeals((prev) => { const n = new Set(prev || firstOpen); if (n.has(name)) n.delete(name); else n.add(name); return n; });
    // The next six meals show; the rest of the week is one tap away, so a
    // 29-meal plan does not open as 29 rows. The loose items always show.
    const MEAL_CAP = 6;
    const shownGroups = mealsAll ? groups : [...named.slice(0, MEAL_CAP), ...groups.filter((g) => !g.name)];
    const moreMeals = named.length - MEAL_CAP;
    return (
      <>
        {named.length > 0 && (
          <div style={{ marginTop: 12, fontFamily: tc.BODY, fontSize: 12.5, lineHeight: 1.45, color: t.INK50 }}>
            <span style={{ color: t.INK70, fontWeight: 600 }}>{trG('nutrition:grocery.shop.mealsItems', { defaultValue: '{meals, plural, one {# meal} other {# meals}} · {items, plural, one {# item} other {# items}}.', meals: named.length, items: total })}</span>{' '}
            {trG('nutrition:grocery.shop.byMealHint', { defaultValue: 'Each ingredient sits under the meal it’s for. Skip a meal and its items come off the list.' })}
          </div>
        )}
        {shownGroups.map((g, gi) => {
          const skip = !!(g.name && skipped.has(g.name));
          const w = g.name ? when(g.name) : null;
          const open = !skip && (g.name ? isOpen(g.name) : true);
          const gotN = g.items.filter((x) => isGot(x.ai, x.ii)).length;
          const offN = g.items.filter((x) => bsGrocerySkipped(x.item, skipped)).length;
          const full = gotN === g.items.length;
          return (
            <div key={g.name || '__loose'} data-grocery-meal="" style={{ marginTop: gi ? 0 : 8, borderTop: `1px solid ${open ? t.RULE : t.HAIR}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => { if (g.name && !skip) flip(g.name); }} aria-expanded={g.name && !skip ? open : undefined} disabled={!g.name || skip} style={{ flex: 1, minWidth: 0, minHeight: 54, padding: '6px 0', background: 'transparent', border: 0, textAlign: 'left', cursor: g.name && !skip ? 'pointer' : 'default' }}>
                  <span style={mono(7.5, skip ? gold : open ? accent : t.INK50, { display: 'block', letterSpacing: '0.16em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>{w ? w.label : g.name ? trG('nutrition:grocery.shop.mealKicker', { defaultValue: 'Meal' }) : trG('nutrition:grocery.shop.notForMeal', { defaultValue: 'Not for a meal' })}</span>
                  <span style={{ display: 'block', marginTop: 3, fontFamily: tc.HEAD, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: skip ? t.INK50 : t.INK, textDecoration: skip ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name || trG('nutrition:grocery.shop.otherItems', { defaultValue: 'Other items' })}</span>
                </button>
                {skip ? (
                  <span style={{ flexShrink: 0, fontFamily: tc.BODY, fontSize: 12, color: gold, whiteSpace: 'nowrap' }}>{trG('nutrition:grocery.shop.skippedOff', { defaultValue: 'Skipped · {count} off', count: offN })}</span>
                ) : (
                  <span data-grocery-meal-got="" aria-label={trG('nutrition:grocery.shop.itemsGot', { defaultValue: '{count, plural, one {# item} other {# items}} · {got} got', count: g.items.length, got: gotN })} style={{ ...led(full ? accent : t.INK, full), flexShrink: 0, minWidth: 46, height: 30, padding: '0 6px', display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: full ? accent : t.INK70, ...(full ? glow(accent) : {}) }}>{gotN}/{g.items.length}</span>
                )}
                {g.name && (
                  <button type="button" onClick={() => toggleSkip(g.name)} style={{ flexShrink: 0, minHeight: 44, minWidth: 40, padding: '0 2px', background: 'transparent', border: 0, cursor: 'pointer', ...mono(8.5, skip ? gold : t.INK70) }}>
                    {skip ? trG('nutrition:grocery.shop.unskip', { defaultValue: 'Undo' }) : trG('nutrition:grocery.shop.skip', { defaultValue: 'Skip' })}
                  </button>
                )}
              </div>
              {open ? <div style={{ paddingBottom: 4 }}>{g.items.map((x, i) => itemRow(x.ai, x.ii, x.item, { compact: true, first: i === 0 }))}</div> : null}
            </div>
          );
        })}
        {moreMeals > 0 && (
          <button type="button" onClick={() => setMealsAll((v) => !v)} aria-expanded={mealsAll} style={quietBtn({ marginTop: 10, ...mono(9, accent) })}>
            {mealsAll ? trG('nutrition:grocery.shop.showFewer', { defaultValue: 'Show fewer ▴' }) : trG('nutrition:grocery.shop.moreMeals', { defaultValue: '{count, plural, one {# more meal ▾} other {# more meals ▾}}', count: moreMeals })}
          </button>
        )}
      </>
    );
  })();

  // A lit chip under Send to Instacart (Save, Share, Send to a member): the chosen state framed and glowing.
  const chip = (on) => ({ ...led(accent, on), flex: '1 1 auto', minHeight: 44, padding: '0 10px', borderRadius: 9, cursor: 'pointer', ...mono(8.5, on ? accent : t.INK70, { letterSpacing: '0.1em', whiteSpace: 'nowrap', ...(on ? glow(accent, 0.55) : {}) }) });

  return (
    <BSPage>
      <BSPageHeader trailing={<BSHeaderTools onProfile={onProfile} />} />
      {/* Header — title + a small ＋ box (new custom list) */}
      <div style={{ padding: `4px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 34, fontWeight: t.W.display, color: t.INK, lineHeight: 0.92, letterSpacing: '-0.035em' }}>{TG('nutrition:grocery.shop.titleA', 'Food')}<br /><span style={{ fontStyle: 'italic', color: accent }}>{TG('nutrition:grocery.shop.titleB', 'list.')}</span></div>
          <button onClick={onCreate} aria-label={TG('nutrition:grocery.shop.newAria', 'New custom grocery list')} style={{ flexShrink: 0, width: 34, height: 34, marginTop: 4, borderRadius: 5, border: `1px solid ${accent}66`, borderLeft: `3px solid ${accent}`, background: `${accent}14`, color: accent, cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 16, fontWeight: 800, lineHeight: 1 }}>＋</button>
        </div>
      </div>

      <BSNutritionTopTabs active="grocery" onChange={onChangeView} />

      <BSCleanType t={tc}>

      {/* THE LIST HEAD — one LED slot around the whole of it (owner, 2026-11-04: "include a bubble around
          this top part that matches C design"): what is left to get lit in its own count slot, the list's
          source named, its name, how far the shop has got, Switch list (a 44px key that opens the picker),
          and the progress line at its foot. The frame takes the list's kind colour, as the Library's
          slots do. */}
      <div data-grocery-list-card="" style={{ ...led(src.c), borderRadius: 14, margin: `14px ${t.padX}px 0`, padding: '10px 10px 0 10px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span data-grocery-left="" style={{ ...led(left > 0 ? accent : t.INK, left > 0), flexShrink: 0, width: 62, height: 56, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {total > 0 && left === 0 ? <span style={{ fontFamily: t.MONO, fontSize: 18, fontWeight: 700, color: accent, ...glow(accent) }}>✓</span> : (
              <>
                {leftBefore ? slotWord(leftBefore, false) : null}
                <span style={{ fontFamily: t.MONO, fontSize: leftFig.length > 3 ? 16 : 22, fontWeight: 700, lineHeight: 1, letterSpacing: '0.03em', color: accent, ...glow(accent, 0.75), fontVariantNumeric: 'tabular-nums' }}>{leftFig}</span>
                {leftAfter ? slotWord(leftAfter, true) : null}
              </>
            )}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={mono(8, src.c, { display: 'block', letterSpacing: '0.16em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...glow(src.c, 0.4) })}>{src.l}</span>
            <span style={{ display: 'block', marginTop: 2, fontFamily: tc.HEAD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{list.name}</span>
            <span style={{ display: 'block', marginTop: 3, fontFamily: tc.BODY, fontSize: 12.5, color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? inCartOf : null}{offCount > 0 ? <> · {skippedNote}</> : null}</span>
          </span>
          <button type="button" onClick={() => setPickerOpen(true)} aria-haspopup="dialog" aria-label={TG('nutrition:grocery.shop.pickAria', 'Choose a grocery list')} style={{ ...led(t.INK, false), flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44, padding: '0 10px', borderRadius: 9, cursor: 'pointer', ...mono(8.5, t.INK70, { letterSpacing: '0.1em', whiteSpace: 'nowrap' }) }}>
            {trG('nutrition:grocery.shop.switchList', { defaultValue: 'Switch list' })}{chev}
          </button>
        </div>
        {total > 0 ? (
          <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={inCartOf} style={{ height: 3, margin: '10px -10px 0', background: t.HAIR }}>
            <div style={{ height: '100%', width: `${pct}%`, minWidth: done > 0 ? 3 : 0, background: accent, boxShadow: t.isLight ? 'none' : `0 0 8px ${bsGlA(accent, 0.6)}`, transition: 'width 0.2s ease' }} />
          </div>
        ) : <div style={{ height: 10 }} />}
      </div>

      {/* List picker — coach plan + everything in the library, switch in place */}
      {pickerOpen && createPortal(
        <div onClick={() => setPickerOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', maxHeight: '74%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `14px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))` }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent }}>{TG('nutrition:grocery.shop.pickerEyebrow', 'Grocery · Switch list')}</div>
            <div style={{ marginTop: 5, marginBottom: 12, fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>{TG('nutrition:grocery.shop.pickerTitleA', 'Choose a')} <span style={{ fontStyle: 'italic', color: accent }}>{TG('nutrition:grocery.shop.pickerTitleB', 'list.')}</span></div>
            {(() => {
              const isPlan = !list.kind || list.kind === 'plan';
              const rows = [
                { key: '__plan__', name: (planList && planList.name) || TG('nutrition:eat.groceryPlanName', "This week's plan"), label: TG('nutrition:grocery.shop.srcPlan', 'Nutri plan'), c: gold, on: isPlan, pick: () => onPickList && onPickList(null) },
                ...recipeLists.map((l) => ({
                  key: l.id,
                  name: l.name,
                  label: l.kind === 'recipe' ? TG('nutrition:grocery.shop.srcRecipe', 'Recipe') : l.kind === 'mealplan' ? TG('nutrition:grocery.shop.srcMealPlan', 'Meal plan') : TG('nutrition:grocery.shop.srcCustom', 'Custom'),
                  c: l.kind === 'recipe' ? t.AMBER : l.kind === 'mealplan' ? gold : '#8a5cf6',
                  sub: l.count != null ? TG('nutrition:grocery.itemCount', `${l.count} item${l.count === 1 ? '' : 's'}`, { count: l.count }) : '',
                  on: list.id === l.id,
                  pick: () => onPickList && onPickList(l),
                })),
              ];
              return rows.map((r) => (
                <button key={r.key} onClick={() => { setPickerOpen(false); r.pick(); }} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px', marginBottom: 8, borderRadius: 6, border: `1px solid ${r.on ? r.c : t.RULE}`, borderLeft: `3px solid ${r.c}`, background: r.on ? `${r.c}14` : t.PAPER2 }}>
                  <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: r.c, background: `${r.c}1a`, border: `1px solid ${r.c}55`, borderRadius: 4, padding: '3px 8px' }}>{r.label}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                    {r.sub ? <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{r.sub}</span> : null}
                  </span>
                  {r.on && <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, color: r.c }}>{TG('nutrition:grocery.shop.showing', '✓ SHOWING')}</span>}
                </button>
              ));
            })()}
            <button onClick={() => { setPickerOpen(false); onChangeView('library'); }} style={{ width: '100%', marginTop: 4, padding: '12px', borderRadius: 5, border: `1px solid ${accent}`, background: 'transparent', color: accent, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{TG('nutrition:grocery.shop.openLibrary', 'Open the library →')}</button>
          </div>
        </div>,
        (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
      )}

      {/* Coach-sent grocery list — review + swap items, then add to your list */}
      <BSCoachGroceryReview t={tc} teal={teal} onAdd={(g) => {
        const aisles = (list.aisles && list.aisles.length) ? list.aisles.map(a => ({ ...a, items: [...a.items] })) : [];
        const findAisle = (name) => { const al = bsGroceryAisleFor(name); let idx = aisles.findIndex(a => a.aisle === al); if (idx < 0) { aisles.push({ aisle: al, items: [] }); idx = aisles.length - 1; } return idx; };
        (g.items || []).forEach((it, n) => { const ai = findAisle(it.item); aisles[ai].items.push({ id: `coach-${Date.now()}-${n}`, n: it.item, q: it.qty || '1', meals: g.source, have: false }); });
        onUpdate({ ...list, aisles });
      }} />

      <div style={{ padding: `0 ${t.padX}px 24px` }}>
        {/* SHOP BY — aisle or meal. */}
        {allKeys.length > 0 && (
          <GroceryShopBy value={shopBy} onChange={setShopBy} accent={accent}
            label={trG('nutrition:grocery.shop.shopBy', { defaultValue: 'Shop by' })}
            aisleLabel={trG('nutrition:grocery.shop.byAisle', { defaultValue: 'Aisle' })}
            mealLabel={trG('nutrition:grocery.shop.byMeal', { defaultValue: 'Meal' })} />
        )}

        {byAisle}
        {byMeal}

        {total === 0 && <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: t.MONO, fontSize: 10, color: t.INK50, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{editable ? TG('nutrition:grocery.shop.emptyEditable', 'Add your first item below.') : TG('nutrition:grocery.shop.emptyRead', 'This list is empty.')}</div>}

        {/* Add item (editable lists) — one inset bar: type an item and its amount and ＋, or tap the mic
            and speak the whole list (the separate full-width voice button folded into the bar). */}
        {editable && (
          <div data-grocery-add="" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
              <span style={mono(8.5, accent, { letterSpacing: '0.16em', ...glow(accent, 0.45) })}>{TG('nutrition:grocery.shop.addItem', 'Add item')}</span>
              <span style={mono(7.5, vState === 'rec' ? t.RUST : t.INK50, { letterSpacing: '0.1em', fontWeight: 700 })}>
                {vState === 'rec' ? TG('nutrition:grocery.shop.vListening', '● Listening — tap Stop when done') : vState === 'busy' ? TG('nutrition:log.transcribing', 'Transcribing…') : TG('nutrition:grocery.shop.vHint', 'Or speak the whole list')}
              </span>
            </div>
            <div style={{ ...led(t.INK, false), borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6, padding: 4 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder={TG('nutrition:grocery.build.itemPlaceholder', 'Item')} style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', color: t.INK, padding: '0 10px', fontFamily: tc.DISPLAY, fontSize: 15, outline: 'none' }} />
              <input value={newQty} onChange={(e) => setNewQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder={TG('nutrition:grocery.build.qtyPlaceholder', 'Qty')} style={{ width: 52, height: 40, border: 0, borderLeft: `1px solid ${t.HAIR}`, background: 'transparent', color: t.INK, padding: '0 8px', fontFamily: t.MONO, fontSize: 12, outline: 'none', textAlign: 'center' }} />
              <button type="button" onClick={voiceTap} disabled={vState === 'busy'} aria-label={vState === 'rec' ? TG('nutrition:grocery.shop.vStop', 'Stop & add items') : vState === 'busy' ? TG('nutrition:grocery.shop.vAdding', 'Adding from voice…') : TG('nutrition:grocery.shop.vStart', 'Speak your list — auto-adds each item')} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 9, border: 0, cursor: vState === 'busy' ? 'wait' : 'pointer', display: 'grid', placeItems: 'center', background: vState === 'rec' ? bsGlA(t.RUST, 0.16) : bsGlA(accent, 0.12), color: vState === 'rec' ? t.RUST : accent }}>
                {vState === 'rec'
                  ? <span style={{ width: 12, height: 12, borderRadius: 2, background: t.RUST, animation: 'bsGrocBlink 1.1s ease-in-out infinite' }} />
                  : <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
              </button>
              <button type="button" onClick={addItem} aria-label={TG('nutrition:grocery.shop.addCta', 'Add')} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 9, border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', background: accent, color: onAccent, fontFamily: t.MONO, fontSize: 18, fontWeight: 800, lineHeight: 1, boxShadow: t.isLight ? 'none' : `0 0 14px ${bsGlA(accent, 0.35)}` }}>＋</button>
            </div>
            {vState === 'rec' && <style>{`@keyframes bsGrocBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>}
          </div>
        )}

        {/* Actions — Send to Instacart lit, then Save, Share and Send to a member as lit chips. Send to a
            member (owner, 2026-10-23): the list goes to them in a message, as a card they can save to their
            own lists. What is sent is what this list shows (skipped meals' items left off). */}
        {total > 0 && (
          <div style={{ marginTop: 20 }}>
            <button type="button" onClick={sendInstacart} style={{ width: '100%', minHeight: 50, borderRadius: 10, border: 0, background: accent, color: onAccent, cursor: 'pointer', ...mono(10.5, undefined, { letterSpacing: '0.12em' }), boxShadow: t.isLight ? 'none' : `0 0 22px ${bsGlA(accent, 0.34)}` }}>{TG('nutrition:grocery.shop.instacart', 'Send to Instacart →')}</button>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <button type="button" aria-pressed={grocerySaved} onClick={saveToLib} style={chip(grocerySaved)}>{grocerySaved ? TG('nutrition:grocery.shop.saved', '✓ Saved') : TG('nutrition:grocery.shop.saveToLib', '+ Save to library')}</button>
              <button type="button" onClick={shareList} style={chip(false)}>{TG('nutrition:grocery.shop.share', 'Share')}</button>
              <button type="button" data-bs-grocery-send="" onClick={() => setSendOpen(true)} style={chip(false)}>{TG('nutrition:grocery.shop.sendMember', 'Send to a member →')}</button>
            </div>
          </div>
        )}

        {/* PREP THE WEEK door (PR C) — shopping done, cooking next, so it sits after the list. Optional
            always; renders only where the host wired the session. It says what it opens. */}
        {onPrep && (
          <button type="button" data-bsck-door="prep" onClick={onPrep} style={{ ...led(accent, false), borderRadius: 12, marginTop: 14, width: '100%', minHeight: 58, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 13px', textAlign: 'left', color: t.INK }}>
            <span aria-hidden style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: bsGlA(accent, 0.12), color: accent, boxShadow: t.isLight ? 'none' : `0 0 10px ${bsGlA(accent, 0.25)}` }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" /><path d="M2 11h2M20 11h2M9 7.5c0-1 .8-1.4.8-2.5M14 7.5c0-1 .8-1.4.8-2.5" /></svg>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: tc.HEAD, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{trG('cook:prep.door', { defaultValue: 'Prep the week' })}</span>
              <span style={{ display: 'block', marginTop: 1, fontFamily: tc.BODY, fontSize: 12.5, color: t.INK70, lineHeight: 1.3 }}>{trG('cook:prep.doorSub', { defaultValue: 'Pick the dishes and cook them in one go' })}</span>
            </span>
            <span aria-hidden style={{ flexShrink: 0, color: accent, fontWeight: 700, fontSize: 15 }}>→</span>
          </button>
        )}
      </div>
      </BSCleanType>
      {sendOpen && <BSPostSendSheet post={{ grocery: list, keep: (it) => !bsGrocerySkipped(it, skipped) }} onClose={() => setSendOpen(false)} />}
      <BSFooter right={TG('nutrition:grocery.shop.footerCount', `${done}/${total} item${total === 1 ? '' : 's'}`, { done, count: total })} />
    </BSPage>
  );
}
