import React from 'react';
// ─── GROCERY LIBRARY (Eat → Library: saved carts) ───────────────────────────
// The member's saved grocery lists, the meal-plan and recipe lists, and the built-in ones: open a list
// to read it, then Load, Edit, Duplicate, Delete or Send it to a member (owner, 2026-10-24: "there
// should be a send to member at the bottom here when i click on the list in library. i shouldnt have
// to load it"). Moved out of iosAppBroadsheetClient.jsx when Send was added, as BSLeaderboard was.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. The client module imports this file,
// so it evaluates before that module's body has put BSDetailHeader and the grocery helpers on window;
// a top-level read would capture undefined (React error #130). The component names the globals it
// needs on its first line. This file never imports the client module back.

const { useState } = React;

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

const BS_GROCERY_LIBRARY = [
  { id: 'sun', name: 'Sunday staples',     kind: 'custom',   eyebrow: 'Custom · Updated last Sun', usedCount: 14,  preview: 'Bananas · Eggs · Oats', items: [
    { n: 'Bananas', q: '1 bunch' }, { n: 'Eggs', q: '18 ct' }, { n: 'Rolled oats', q: '1 tub' }, { n: 'Greek yogurt', q: '32 oz' }, { n: 'Baby spinach', q: '2 bags' }, { n: 'Chicken breast', q: '2 lb' }, { n: 'Jasmine rice', q: '2 lb' }, { n: 'Almond butter', q: '1 jar' }, { n: 'Blueberries', q: '2 pints' }, { n: 'Whole milk', q: '1 gal' }, { n: 'Coffee', q: '1 bag' },
  ] },
  { id: 'trv', name: 'Travel week',        kind: 'custom',   eyebrow: 'Custom · Airport-friendly', usedCount: 4, preview: 'Protein bars · Jerky · Apples', items: [
    { n: 'Protein bars', q: '1 box' }, { n: 'Beef jerky', q: '2 bags' }, { n: 'Apples', q: '6' }, { n: 'Mixed nuts', q: '1 bag' }, { n: 'Tuna packets', q: '4' }, { n: 'Rice cakes', q: '1 pack' }, { n: 'Electrolyte mix', q: '1 box' },
  ] },
  { id: 'prep',name: 'Meal prep — Sunday', kind: 'custom',   eyebrow: 'Custom · Weekly', usedCount: 22, preview: 'Chicken thighs · Rice · Broccoli', items: [
    { n: 'Chicken thighs', q: '3 lb' }, { n: 'Jasmine rice', q: '2 lb' }, { n: 'Broccoli', q: '2 heads' }, { n: 'Sweet potato', q: '4' }, { n: 'Olive oil', q: '1 btl' }, { n: 'Eggs', q: '12 ct' }, { n: 'Bell peppers', q: '4' }, { n: 'Black beans', q: '2 cans' }, { n: 'Salsa', q: '1 jar' }, { n: 'Greek yogurt', q: '32 oz' },
  ] },
  { id: 'mp7', name: '7-day Mediterranean',kind: 'mealplan', eyebrow: 'Meal plan · Whole-food', usedCount: 64, preview: 'Olive oil · Fish · Whole grains', items: [
    { n: 'Extra-virgin olive oil', q: '1 btl' }, { n: 'Wild salmon', q: '2 lb' }, { n: 'Whole-grain bread', q: '1 loaf' }, { n: 'Chickpeas', q: '3 cans' }, { n: 'Tomatoes', q: '6' }, { n: 'Cucumber', q: '3' }, { n: 'Feta', q: '8 oz' }, { n: 'Kalamata olives', q: '1 jar' }, { n: 'Lemons', q: '4' }, { n: 'Baby spinach', q: '2 bags' }, { n: 'Quinoa', q: '1 lb' }, { n: 'Hummus', q: '1 tub' },
  ] },
  { id: 'mph', name: 'High-protein cut · 5d',kind: 'mealplan', eyebrow: 'Meal plan · Cutting', usedCount: 42, preview: 'Chicken · Greek yogurt · Eggs', items: [
    { n: 'Chicken breast', q: '3 lb' }, { n: 'Greek yogurt (0%)', q: '32 oz' }, { n: 'Eggs', q: '18 ct' }, { n: 'Egg whites', q: '32 oz' }, { n: 'Cottage cheese', q: '16 oz' }, { n: 'Lean ground beef (93%)', q: '2 lb' }, { n: 'Broccoli', q: '2 heads' }, { n: 'Asparagus', q: '2 bunches' }, { n: 'Jasmine rice', q: '2 lb' }, { n: 'Berries', q: '2 pints' },
  ] },
  { id: 'mpp', name: 'Plant-forward build', kind: 'mealplan', eyebrow: 'Meal plan · Vegan-friendly', usedCount: 18, preview: 'Tempeh · Lentils · Quinoa', items: [
    { n: 'Tempeh', q: '3 blocks' }, { n: 'Lentils', q: '2 lb' }, { n: 'Quinoa', q: '2 lb' }, { n: 'Firm tofu', q: '2 blocks' }, { n: 'Black beans', q: '3 cans' }, { n: 'Chickpeas', q: '3 cans' }, { n: 'Baby spinach', q: '2 bags' }, { n: 'Sweet potato', q: '5' }, { n: 'Peanut butter', q: '1 jar' }, { n: 'Rolled oats', q: '1 tub' }, { n: 'Soy milk', q: '2 cartons' },
  ] },
];

export function bsLibraryPreviewItems(list) {
  const base = String(list.preview || '')
    .split(/[·-]/)
    .map(s => s.trim())
    .filter(Boolean);
  const items = base.length ? base : [list.name];
  const daysMatch = String(list.name || '').match(/(\d+)[-\s]*(?:day|d)/i);
  const days = daysMatch ? Number(daysMatch[1]) : list.kind === 'mealplan' ? 7 : 1;
  return items.map((name, idx) => {
    return {
      id: `${list.id}-item-${idx}`,
      n: name,
      q: list.kind === 'mealplan' ? `${days} day qty` : '1',
      meals: list.name,
    };
  });
}

// How many items a saved list holds: its items when it carries them, else its stored count. The built-in
// lists carry items and no count, so the card read "NaN items".
function bsGroceryLibCount(l) {
  if (l && Array.isArray(l.items)) return l.items.length;
  const n = Number(l && l.count);
  return Number.isFinite(n) ? n : 0;
}

export function BSGroceryLibrary({ onBack, onLoad = () => {}, recipeLists = [], onCreate = () => {}, onEdit = () => {}, onDuplicate = () => {}, onDelete = () => {}, deletedIds = [], onChangeView = null }) {
  const { useBS, BSPage, BSDetailHeader, BSNutritionTopTabs, BSEyebrow, BSFooter, BSPostSendSheet, _bsScrollTopOnMount, bsGroceryHues, bsDateLocale, bsGroceryListEyebrow } = window;
  const t = useBS();
  const tr = useShapeTr();
  _bsScrollTopOnMount();
  // Client surface: teal leads; nutritionist-sent plans tag gold, recipes amber, custom purple.
  const { teal, gold } = bsGroceryHues(t);
  const [filter, setFilter] = useState('all'); // all | custom | template | mealplan | recipe
  const [query, setQuery] = useState('');
  const [openList, setOpenList] = useState(null);
  // Send to a member from the Library, without loading the list first (owner, 2026-10-24).
  const [sendFor, setSendFor] = useState(null);
  const allLists = [...recipeLists, ...BS_GROCERY_LIBRARY].filter(l => !deletedIds.includes(l.id));
  // ⚠ toLowerCase() IS LOCALE-INSENSITIVE, and the eyebrow below is translated
  // now — the Turkish dotted/dotless-i class. Both sides of the comparison have
  // to fold the same way or a locale where they disagree silently matches
  // nothing, so the query and every haystack go through one folder.
  const fold = (v) => { try { return String(v || '').toLocaleLowerCase(bsDateLocale()); } catch (e) { return String(v || '').toLowerCase(); } };
  const matchesQuery = (l) => {
    const q = fold(query.trim());
    if (!q) return true;
    // ⚠ SEARCH THE RENDERED EYEBROW, NOT THE STORED ONE. Now that a record
    // carries a token rather than a sentence, `l.eyebrow` is the back-compat
    // string and can differ from what is on screen (a dated list stores
    // "Created today" and renders "Created 14 Jul") — searching the stored
    // copy would match text the member cannot see and miss text they can.
    if (fold(l.name).includes(q) || fold(l.preview).includes(q) || fold(bsGroceryListEyebrow(l, tr)).includes(q)) return true;
    const items = l.items || bsLibraryPreviewItems(l) || [];
    return items.some(it => fold(it.n).includes(q));
  };
  const filtered = allLists.filter(l => filter === 'all' || l.kind === filter).filter(matchesQuery);

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={tr('nutrition:grocery.lib.count', { defaultValue: `${allLists.length} list${allLists.length === 1 ? '' : 's'}`, count: allLists.length })}
        kicker={tr('nutrition:grocery.lib.kicker', { defaultValue: 'Section · Library' })}
        title={<>{tr('nutrition:grocery.lib.titleA', { defaultValue: 'Saved' })}<br/>{tr('nutrition:grocery.lib.titleB', { defaultValue: 'carts.' })}</>}
      />

      {onChangeView && <BSNutritionTopTabs active="library" onChange={onChangeView} />}

      {/* New list */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <button onClick={onCreate} style={{ width: '100%', borderRadius: 5, clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)',
          padding: '14px 14px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>{tr('nutrition:grocery.lib.newList', { defaultValue: '＋ New grocery list' })}</button>
      </div>

      {/* Search saved lists */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, borderBottom: `1px solid ${t.RULE}`, padding: '8px 2px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.INK50} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('nutrition:grocery.lib.searchPlaceholder', { defaultValue: 'Search saved lists…' })} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14 }} />
          {query && <button onClick={() => setQuery('')} style={{ border: 0, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer' }}>{tr('nutrition:grocery.lib.clear', { defaultValue: 'CLEAR' })}</button>}
        </div>
      </div>

      {/* Filter index — typographic, active = ink + teal underline */}
      <div style={{ padding: `12px ${t.padX}px 4px`, display: 'flex', gap: 20, flexWrap: 'wrap', rowGap: 4, borderBottom: `1px solid ${t.HAIR}` }}>
        {[['all', tr('nutrition:grocery.lib.filterAll', { defaultValue: 'All' })],
          ['recipe', tr('nutrition:grocery.lib.filterRecipes', { defaultValue: 'Recipes' })],
          ['custom', tr('nutrition:grocery.lib.filterCustom', { defaultValue: 'Custom' })],
          ['mealplan', tr('nutrition:grocery.lib.filterMealPlans', { defaultValue: 'Meal Plans' })]].map(([k, l]) => {
          const on = filter === k;
          return (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={on} style={{
              flex: '0 0 auto', minHeight: 40, padding: '2px 0 8px', position: 'relative',
              background: 'transparent', border: 0, cursor: 'pointer',
              color: on ? t.INK : t.INK50,
              fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>{l}{on && <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: teal }} />}</button>
          );
        })}
      </div>

      <div style={{ padding: `2px ${t.padX}px`, display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 0', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>
            <span aria-hidden style={{ flex: 1, borderBottom: `1px dashed ${t.RULE}` }} />
            {query.trim() ? tr('nutrition:grocery.lib.noMatch', { defaultValue: 'No lists match your search' }) : tr('nutrition:grocery.lib.empty', { defaultValue: 'No saved lists yet' })}
            <span aria-hidden style={{ flex: 1, borderBottom: `1px dashed ${t.RULE}` }} />
          </div>
        )}
        {filtered.map((l, idx) => {
          const color = l.kind === 'mealplan' ? gold : l.kind === 'custom' ? '#8a5cf6' : (l.kind === 'recipe' || l.kind === 'template') ? t.AMBER : teal;
          const open = openList === l.id;
          const previewItems = l.items || bsLibraryPreviewItems(l);
          const itemCount = bsGroceryLibCount(l);
          const textAction = (c) => ({ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: c, borderBottom: `2px solid ${c}66` });
          return (
            <div key={l.id} style={{ position: 'relative', borderTop: idx ? `1px solid ${t.HAIR}` : 0, paddingTop: idx ? 16 : 8, paddingBottom: 16, paddingLeft: 13 }}>
              <span aria-hidden style={{ position: 'absolute', left: 0, top: idx ? 16 : 8, bottom: 16, width: 3, background: color }} />
              <div onClick={() => setOpenList(open ? null : l.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 10 }}>
                  <BSEyebrow color={color}>{bsGroceryListEyebrow(l, tr)}</BSEyebrow>
                  <BSEyebrow>{tr('nutrition:grocery.lib.uses', { defaultValue: `${l.usedCount} use${l.usedCount === 1 ? '' : 's'}`, count: l.usedCount })}</BSEyebrow>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{l.name}</div>
                  <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 13, color: t.INK50, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                </div>
                {/* ⚠ THE EMPTY STATE LIVES HERE NOW, not in the record. Moving it
                    makes it visible to the inventory walk for the first time — a
                    string written into a saved list is a string the measurement
                    cannot see, which is the BSWeekStrip blind spot in reverse. */}
                <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9.5, color: t.INK70, letterSpacing: '0.06em' }}>{tr('nutrition:grocery.itemCount', { defaultValue: `${itemCount} item${itemCount === 1 ? '' : 's'}`, count: itemCount })} · {l.preview || tr('nutrition:grocery.lib.emptyList', { defaultValue: 'Empty list' })}</div>
              </div>
              {open && previewItems && previewItems.length > 0 && (
                <div style={{ margin: '12px 0 2px' }}>
                  {previewItems.map((it, i2) => (
                    <div key={it.id || i2} style={{
                      display: 'grid', gridTemplateColumns: '54px 1fr', gap: 10, padding: '9px 0',
                      borderTop: i2 ? `1px solid ${t.HAIR}` : 0,
                    }}>
                      <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK70, fontWeight: 700, letterSpacing: '0.06em' }}>{it.q}</span>
                      <span>
                        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, fontWeight: 700, letterSpacing: '-0.01em' }}>{it.n}</span>
                        {it.meals && <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.08em', marginTop: 2, textTransform: 'uppercase' }}>{it.meals}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', rowGap: 10, marginTop: 12 }}>
                <button onClick={() => onLoad(l)} style={{ borderRadius: 5, padding: '9px 14px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', background: t.INK, color: t.PAPER, border: 0, clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)' }}>{tr('nutrition:grocery.lib.load', { defaultValue: 'Load →' })}</button>
                <button onClick={() => onEdit(l)} style={textAction(t.INK)}>{tr('nutrition:grocery.lib.edit', { defaultValue: 'Edit' })}</button>
                {l.kind === 'mealplan' && (
                  <button onClick={() => onDuplicate(l)} style={textAction(t.INK)}>{tr('nutrition:grocery.lib.duplicate', { defaultValue: 'Duplicate' })}</button>
                )}
                {l.kind === 'custom' && (
                  <button onClick={() => onDelete(l)} style={{ ...textAction(t.RUST), marginLeft: 'auto' }}>{tr('nutrition:grocery.lib.delete', { defaultValue: 'Delete' })}</button>
                )}
              </div>
              {/* An open list goes to a member as it stands, as from the grocery page, without loading it. A
                  list saved without items sends the items its card shows (Codex P2 on #2435): the message is
                  built from items or aisles, so the bare record would fail to send. */}
              {open && previewItems && previewItems.length > 0 && (
                <button type="button" data-bs-grocery-send="" onClick={() => setSendFor({ ...l, items: previewItems })} style={{ marginTop: 6, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  <span style={textAction(teal)}>{tr('nutrition:grocery.shop.sendMember', { defaultValue: 'Send to a member →' })}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <BSFooter right={tr('nutrition:grocery.lib.footer', { defaultValue: 'Library' })} />
      {sendFor && <BSPostSendSheet post={{ grocery: sendFor }} onClose={() => setSendFor(null)} />}
    </BSPage>
  );
}
