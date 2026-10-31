import React from 'react';
import { useBSClean, BSCleanType } from './bsCleanType.jsx';
// ─── GROCERY LIBRARY (Eat → Library: saved carts) ───────────────────────────
// The member's saved grocery lists, the meal-plan and recipe lists, and the built-in ones: open a list
// to read it, then Load, Edit, Duplicate, Delete or Send it to a member (owner, 2026-10-24: "there
// should be a send to member at the bottom here when i click on the list in library. i shouldnt have
// to load it"). Moved out of iosAppBroadsheetClient.jsx when Send was added, as BSLeaderboard was.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. The client module imports this file,
// so it evaluates before that module's body has put BSHeaderTools and the grocery helpers on window;
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

export function BSGroceryLibrary({ onLoad = () => {}, recipeLists = [], onCreate = () => {}, onEdit = () => {}, onDuplicate = () => {}, onDelete = () => {}, deletedIds = [], onChangeView = null, onProfile = null }) {
  const { useBS, BSPage, BSPageHeader, BSHeaderTools, BSNutritionTopTabs, BSFooter, BSPostSendSheet, _bsScrollTopOnMount, bsGroceryHues, bsDateLocale, bsGroceryListEyebrow } = window;
  const t = useBS();
  // Under the Eat · Library tabs, the clean type, as Day and Grocery (owner, 2026-10-29: "Yes", to moving
  // Grocery and the Library off Saira). The header, the tabs and Send to a member keep the app's own type.
  const tc = useBSClean();
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
      {/* A tab of Eat, headed as Day, Grocery and Recipes are: the masthead and the title, with no Back
          and no "Section · Library" (owner, 2026-10-31). The count stands at the title's foot. */}
      <BSPageHeader trailing={<BSHeaderTools onProfile={onProfile || (() => { try { window.dispatchEvent(new CustomEvent('shape:openProfile')); } catch (e) {} })} />} />
      <div style={{ padding: `4px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 34, fontWeight: t.W.display, color: t.INK, lineHeight: 0.92, letterSpacing: '-0.035em' }}>{tr('nutrition:grocery.lib.titleA', { defaultValue: 'Saved' })}<br/>{tr('nutrition:grocery.lib.titleB', { defaultValue: 'carts.' })}</div>
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', paddingBottom: 3 }}>{tr('nutrition:grocery.lib.count', { defaultValue: `${allLists.length} list${allLists.length === 1 ? '' : 's'}`, count: allLists.length })}</span>
        </div>
      </div>

      {onChangeView && <BSNutritionTopTabs active="library" onChange={onChangeView} />}

      <BSCleanType t={tc}>

      {/* New list */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <button onClick={onCreate} style={{ width: '100%', minHeight: 46, borderRadius: 10,
          padding: '12px 14px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>{tr('nutrition:grocery.lib.newList', { defaultValue: '＋ New grocery list' })}</button>
      </div>

      {/* Search saved lists */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, borderBottom: `1px solid ${t.RULE}`, padding: '8px 2px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.INK50} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('nutrition:grocery.lib.searchPlaceholder', { defaultValue: 'Search saved lists…' })} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: tc.DISPLAY, fontSize: 14 }} />
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
        {/* A compact index (owner, 2026-10-24, of the Library: "improve design and look of this library
            page", then option C of three): the item count in a tile, the name and what it holds, and a
            chevron. A tap opens the list: its kind and uses, its items, and its actions. */}
        {filtered.map((l) => {
          const color = l.kind === 'mealplan' ? gold : l.kind === 'custom' ? t.INK70 : (l.kind === 'recipe' || l.kind === 'template') ? t.AMBER : teal;
          // The tile's figure takes the list's kind colour where the kind has one; a member's own list is ink.
          const figure = l.kind === 'custom' ? t.INK : color;
          const open = openList === l.id;
          const previewItems = l.items || bsLibraryPreviewItems(l);
          const itemCount = bsGroceryLibCount(l);
          // The tile sets the figure large and its words small, read off the one translated count and kept
          // in its order (Codex P2 on #2447): "11 items" sets the word under the figure, Hausa's
          // "kayayyaki 11" sets it above, so the tile shows and reads as the locale says it.
          const countLabel = tr('nutrition:grocery.itemCount', { defaultValue: `${itemCount} item${itemCount === 1 ? '' : 's'}`, count: itemCount });
          // The figure is the whole localized number, its grouping included ("1,200", "1.200"; Codex P2 on
          // #2447), shown as the translation formats it rather than re-printed from the count.
          const countParts = String(countLabel).match(/^(.*?)(\d+(?:[.,\s\u00a0\u202f'’]\d+)*)(.*)$/);
          const countFigure = countParts ? countParts[2] : String(itemCount);
          const countBefore = countParts ? countParts[1].trim() : '';
          const countAfter = countParts ? countParts[3].trim() : '';
          const countWord = (w, below) => <span style={{ [below ? 'marginTop' : 'marginBottom']: 3, maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{w}</span>;
          const key = (primary) => ({
            minHeight: 40, padding: '0 14px', borderRadius: 9, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
            background: primary ? t.INK : 'transparent', color: primary ? t.PAPER : t.INK,
            border: primary ? 0 : `1px solid ${t.RULE}`,
          });
          return (
            <div key={l.id} style={{ borderBottom: `1px solid ${t.HAIR}` }}>
              <button type="button" aria-expanded={open} onClick={() => setOpenList(open ? null : l.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
                background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left', color: t.INK,
              }}>
                <span style={{ width: 52, height: 52, flex: 'none', borderRadius: 12, background: t.PAPER2 || t.PAPER, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {countBefore ? countWord(countBefore, false) : null}
                  <span style={{ fontFamily: tc.DISPLAY, fontSize: countFigure.length > 3 ? 15 : 19, fontWeight: 500, lineHeight: 1, color: figure, fontVariantNumeric: 'tabular-nums' }}>{countFigure}</span>
                  {countAfter ? countWord(countAfter, true) : null}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: tc.DISPLAY, fontSize: 16.5, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.2, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                  {/* ⚠ THE EMPTY STATE LIVES HERE NOW, not in the record. Moving it
                      makes it visible to the inventory walk for the first time — a
                      string written into a saved list is a string the measurement
                      cannot see, which is the BSWeekStrip blind spot in reverse. */}
                  <span style={{ display: 'block', marginTop: 2, fontFamily: tc.BODY, fontSize: 12.5, color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.preview || tr('nutrition:grocery.lib.emptyList', { defaultValue: 'Empty list' })}</span>
                </span>
                <span aria-hidden style={{ flex: 'none', width: 20, textAlign: 'center', fontSize: 20, lineHeight: 1, color: t.INK50, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
              </button>
              {open && (
                <div style={{ padding: '0 0 14px 64px' }}>
                  {/* What kind of list and how often it is used, one line that wraps as words. */}
                  <div style={{ fontFamily: tc.BODY, fontSize: 12.5, lineHeight: 1.4, color: t.INK50 }}>
                    <span style={{ color }}>{bsGroceryListEyebrow(l, tr)}</span>
                    {' · '}{tr('nutrition:grocery.lib.uses', { defaultValue: `${l.usedCount} use${l.usedCount === 1 ? '' : 's'}`, count: l.usedCount })}
                  </div>
                  {previewItems && previewItems.length > 0 && (
                    <div style={{ margin: '8px 0 2px' }}>
                      {previewItems.map((it, i2) => (
                        <div key={it.id || i2} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderTop: i2 ? `1px solid ${t.HAIR}` : 0 }}>
                          <span style={{ flex: 1, minWidth: 0, fontFamily: tc.BODY, fontSize: 14, color: t.INK }}>{it.n}</span>
                          <span style={{ flex: 'none', fontFamily: t.MONO, fontSize: 10, color: t.INK50, letterSpacing: '0.04em' }}>{it.q}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <button onClick={() => onLoad(l)} style={key(true)}>{tr('nutrition:grocery.lib.load', { defaultValue: 'Load →' })}</button>
                    <button onClick={() => onEdit(l)} style={key(false)}>{tr('nutrition:grocery.lib.edit', { defaultValue: 'Edit' })}</button>
                    {l.kind === 'mealplan' && (
                      <button onClick={() => onDuplicate(l)} style={key(false)}>{tr('nutrition:grocery.lib.duplicate', { defaultValue: 'Duplicate' })}</button>
                    )}
                    {l.kind === 'custom' && (
                      <button onClick={() => onDelete(l)} style={{ ...key(false), marginLeft: 'auto', border: 0, padding: '0 4px', color: t.RUST }}>{tr('nutrition:grocery.lib.delete', { defaultValue: 'Delete' })}</button>
                    )}
                  </div>
                  {/* An open list goes to a member as it stands, as from the grocery page, without loading it. A
                      list saved without items sends the items its card shows (Codex P2 on #2435): the message is
                      built from items or aisles, so the bare record would fail to send. */}
                  {previewItems && previewItems.length > 0 && (
                    <button type="button" data-bs-grocery-send="" onClick={() => setSendFor({ ...l, items: previewItems })} style={{ marginTop: 4, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: teal }}>
                      {tr('nutrition:grocery.shop.sendMember', { defaultValue: 'Send to a member →' })}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </BSCleanType>

      <BSFooter right={tr('nutrition:grocery.lib.footer', { defaultValue: 'Library' })} />
      {sendFor && <BSPostSendSheet post={{ grocery: sendFor }} onClose={() => setSendFor(null)} />}
    </BSPage>
  );
}
