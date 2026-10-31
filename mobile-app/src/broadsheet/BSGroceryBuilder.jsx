import React from 'react';
import { bsTrainT } from './bsClientWeekDemo.js';
import { useBSClean, BSCleanType } from './bsCleanType.jsx';
// ─── BUILD A LIST (Eat → Grocery → ＋) ───────────────────────────────────────
// Name a custom grocery list, add items by aisle, then create it. Moved out of
// iosAppBroadsheetClient.jsx when it was redesigned (owner, 2026-10-29: "Need to update design of
// this page"), in the look of the Library that opens it (#2447): the clean type Eat is set in
// (Geist head, Inter Tight words; bsCleanType.jsx), Shape's teal for the eyebrow, the aisle and the
// quantities in place of the old rust, square-cornered aisle keys, the Grocery page's teal-barred
// key for Add, the items under their aisles as the shop list shows them, and one ink Create.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (BSIntegrationsPage.jsx explains
// why): the chrome's (BSPage, BSFooter, BSMastRow, BS_MAST_TOP_CSS) and the client module's
// grocery helpers (bsGroceryHues, bsBuilderAisleFor, bsAisleLabel, _bsScrollTopOnMount).

const { useState } = React;

// The i18n translator for this module, the same self-contained copy every feature module carries
// (see BSIntegrationsPage.jsx), so this file does not depend on another module's copy.
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

export function BSGroceryBuilder({ onCancel, onCreate }) {
  const { BSPage, BSFooter, BSMastRow, BSBackRow, BS_MAST_TOP_CSS, _bsScrollTopOnMount, bsGroceryHues, bsBuilderAisleFor, bsAisleLabel } = window;
  const t = useBSClean();
  const tr = useShapeTr();
  const TB = bsTrainT(tr);
  _bsScrollTopOnMount();
  const { teal } = bsGroceryHues(t);
  const AISLES = ['Produce', 'Protein', 'Pantry', 'Dairy & cold', 'Frozen', 'Bakery', 'Household'];
  const [name, setName] = useState('');
  const [items, setItems] = useState([]); // { n, q, aisle }
  const [iName, setIName] = useState('');
  const [iQty, setIQty] = useState('');
  const [iAisle, setIAisle] = useState('Produce');
  const [aisleTouched, setAisleTouched] = useState(false); // user override of the auto-sort
  const onNameChange = (v) => { setIName(v); if (!aisleTouched) setIAisle(v.trim() ? bsBuilderAisleFor(v) : 'Produce'); };
  const addItem = () => { const n = iName.trim(); if (!n) return; setItems(a => [...a, { n, q: iQty.trim() || '1', aisle: iAisle }]); setIName(''); setIQty(''); setIAisle('Produce'); setAisleTouched(false); };
  const removeItem = (idx) => setItems(a => a.filter((_, j) => j !== idx));
  const create = () => {
    const nm = name.trim() || 'New list';
    const grouped = AISLES
      .map(al => ({ aisle: al, items: items.map((it, k) => ({ it, k })).filter(x => x.it.aisle === al).map(x => ({ id: `b-${x.k}`, n: x.it.n, q: x.it.q, meals: nm })) }))
      .filter(a => a.items.length);
    const aisles = grouped.length ? grouped : [{ aisle: 'Items', items: [] }];
    onCreate({ name: nm, items: items.map((it, k) => ({ id: `b-${k}`, n: it.n, q: it.q, meals: nm })), aisles });
  };

  const count = items.length;
  const canAdd = !!iName.trim();
  const mono = (size, extra = {}) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', ...extra });
  // A field is a line, as the Library's search is. 16px and up, so iOS doesn't zoom in on focus.
  const field = { width: '100%', boxSizing: 'border-box', border: 0, borderBottom: `1px solid ${t.RULE}`, borderRadius: 0, background: 'transparent', color: t.INK, padding: '9px 2px', fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 400, outline: 'none' };
  // The items under their aisles, in the keys' order, each keeping its place in the list for removal.
  const groups = AISLES
    .map(al => ({ al, rows: items.map((it, idx) => ({ it, idx })).filter(r => r.it.aisle === al) }))
    .filter(g => g.rows.length);

  return (
    <BSPage>
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        {BSMastRow && <BSMastRow trailing={null} />}
        {/* ← Cancel where every page keeps its Back (owner, 2026-10-31), the count on the right. The
            word is the catalog's, without the arrow the back row draws. */}
        {BSBackRow && <BSBackRow onBack={onCancel}
          trailing={<span style={mono(9, { fontWeight: 700, letterSpacing: '0.22em', color: t.INK50 })}>{tr('nutrition:grocery.itemCountCaps', { defaultValue: `${count} ITEM${count === 1 ? '' : 'S'}`, count })}</span>} />}
      </div>
      <BSCleanType t={t}>
        <div style={{ padding: `2px ${t.padX}px 28px` }}>
          <div style={mono(9.5, { marginTop: 8, fontWeight: 700, letterSpacing: '0.24em', color: teal })}>{tr('nutrition:grocery.build.eyebrow', { defaultValue: 'NEW LIST' })}</div>
          <div style={{ marginTop: 8, fontFamily: t.HEAD, fontSize: 32, fontWeight: 600, lineHeight: 1.02, letterSpacing: '-0.03em', color: t.INK }}>
            {tr('nutrition:grocery.build.titleA', { defaultValue: 'Build a' })} {tr('nutrition:grocery.build.titleB', { defaultValue: 'list.' })}
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={mono(9, { letterSpacing: '0.2em', color: t.INK50 })}>{tr('nutrition:grocery.build.nameLabel', { defaultValue: 'LIST NAME' })}</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('nutrition:grocery.build.namePlaceholder', { defaultValue: 'e.g. Sunday staples' })} style={{ ...field, fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em' }} />
          </div>

          {/* Add an item: under a rule, as a section of the page, not a card */}
          <div style={{ marginTop: 30, paddingTop: 12, borderTop: `1px solid ${t.INK}` }}>
            <div style={mono(9.5, { letterSpacing: '0.2em', color: t.INK })}>{tr('nutrition:grocery.build.addItem', { defaultValue: 'ADD AN ITEM' })}</div>
            <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 76px', gap: 14, alignItems: 'end' }}>
              <input value={iName} onChange={(e) => onNameChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder={tr('nutrition:grocery.build.itemPlaceholder', { defaultValue: 'Item' })} style={field} />
              <input value={iQty} onChange={(e) => setIQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder={tr('nutrition:grocery.build.qtyPlaceholder', { defaultValue: 'Qty' })} style={{ ...field, fontFamily: t.MONO, fontSize: 16, textAlign: 'right' }} />
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={mono(9, { letterSpacing: '0.2em', color: t.INK50 })}>{tr('nutrition:grocery.build.aisleLabel', { defaultValue: 'AISLE' })}</span>
              <span style={mono(8, { fontWeight: 700, letterSpacing: '0.1em', color: aisleTouched ? t.INK50 : teal })}>{iName.trim() ? (aisleTouched ? tr('nutrition:grocery.build.aisleCustom', { defaultValue: '· custom' }) : tr('nutrition:grocery.build.aisleAuto', { defaultValue: '· auto-sorted — tap to change' })) : ''}</span>
            </div>
            <div style={{ marginTop: 9, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AISLES.map(al => {
                const on = iAisle === al;
                return (
                  <button key={al} type="button" aria-pressed={on} onClick={() => { setIAisle(al); setAisleTouched(true); }} style={{
                    minHeight: 34, padding: '0 11px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}14` : 'transparent', color: on ? teal : t.INK70,
                    ...mono(9, { letterSpacing: '0.08em' }),
                  }}>{bsAisleLabel(al, TB)}</button>
                );
              })}
            </div>
            <button type="button" onClick={addItem} disabled={!canAdd} style={{
              width: '100%', minHeight: 44, marginTop: 14, borderRadius: 8, cursor: canAdd ? 'pointer' : 'default',
              border: `1px solid ${canAdd ? `${teal}66` : t.RULE}`, borderLeft: `3px solid ${canAdd ? teal : t.RULE}`,
              background: canAdd ? `${teal}14` : 'transparent', color: canAdd ? teal : t.INK50,
              ...mono(10, { letterSpacing: '0.14em' }),
            }}>{tr('nutrition:grocery.build.addCta', { defaultValue: '+ Add to list' })}</button>
          </div>

          {/* The list so far, under its aisles */}
          <div style={{ marginTop: 26 }}>
            {count === 0 ? (
              <div style={{ padding: '16px 0', borderTop: `1px dashed ${t.RULE}`, borderBottom: `1px dashed ${t.RULE}`, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50 }}>
                {tr('nutrition:grocery.build.emptyItems', { defaultValue: 'No items yet. Add your first above.' })}
              </div>
            ) : groups.map(g => (
              <div key={g.al} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0 6px', borderBottom: `1px solid ${t.RULE}`, ...mono(9, { letterSpacing: '0.2em', color: teal }) }}>
                  <span>{bsAisleLabel(g.al, TB)}</span>
                  <span style={{ color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{g.rows.length}</span>
                </div>
                {g.rows.map(({ it, idx }) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 50, borderBottom: `1px solid ${t.HAIR}` }}>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 500, letterSpacing: '-0.01em', color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.n}</span>
                    <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: teal }}>{it.q}</span>
                    <button type="button" onClick={() => removeItem(idx)} aria-label={tr('nutrition:log.remove', { defaultValue: 'Remove' })} style={{ width: 40, height: 40, marginRight: -12, flexShrink: 0, border: 0, background: 'transparent', color: t.INK50, fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <button type="button" onClick={create} disabled={count === 0} style={{
            width: '100%', minHeight: 48, marginTop: 22, borderRadius: 10, border: 0,
            background: t.INK, color: t.PAPER, cursor: count ? 'pointer' : 'default', opacity: count ? 1 : 0.35,
            ...mono(10.5, { letterSpacing: '0.18em' }),
          }}>{tr('nutrition:grocery.build.create', { defaultValue: 'Create list →' })}</button>
        </div>
      </BSCleanType>
      <BSFooter right={tr('nutrition:grocery.build.footerCount', { defaultValue: `${count} item${count === 1 ? '' : 's'}`, count })} />
    </BSPage>
  );
}
