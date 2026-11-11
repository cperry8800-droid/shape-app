import React from 'react';
import { createPortal } from 'react-dom';
import { bsDash, bsDashA } from './BSDash.jsx';
import { useBSClean, BSCleanType, bsCleanSheet } from './bsCleanType.jsx';
import { bsDialogRef } from '../services/dialogBack.mjs';
// ─── THE COACHES TAB ("Coaches.") ────────────────────────────────────────────────────────────────
// Owner, 2026-11-09, of three placements and three looks: "place-1" (a sixth tab in the member's nav,
// Coaches, between Eat and Chat) in "look-B" (the Browse list), then option 1 of three filter
// treatments. The page, top to bottom:
//   · the masthead every page has (the mark and the tool pill); a pushed page's ← Back (the tab, a
//     root, has none); "Coaches." with the teal full stop;
//   · Your team: the coaches the member pays, each with Message (no block for a member with none);
//   · the search ("Name or specialty": it searches coaches only), holding the Filters button with a
//     teal count of the filters on; under it one scrolling row: the role ("Both ⌄") and each filter on
//     as a chip that takes it off (BSMktFilters, with the one sheet behind the button);
//   · Editors' picks as a shelf of compact cards; "{n} coaches you can book" with the sort at right;
//     the coaches as compact rows: the face, the name with a teal ✓ when verified, role · specialty in
//     the role's colour, then ★ rating · price per session or per month · the next open intro, and
//     a quiet Book intro;
//   · What's hot (published plans) as quiet rows; the application door as one slim line.
// The type is the coach pages' clean type (bsCleanType.jsx: Geist heads, Inter Tight words), with no
// mono capitals.
//
// ⚠ IT DRAWS, IT DOES NOT DECIDE. Every rule stays in the marketplace module, which hands this view
// what it reads: the filtering and its counts, the sorts, the rating (a coach's reviews, or New), the
// price and its unit, the next open time (a real one, or an example's), the portrait ladder, example
// or live data and the deep link. A row is that module's reading of one coach (mktDirCard there).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx). This file is
// a static import of the marketplace module, so it evaluates before that module's body runs; each
// component names the globals it needs on its first line (tests/market-directory-module.test.mjs).

const { useState, useEffect } = React;

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

// The masthead's top inset is the chrome's (window.BS_MAST_TOP_CSS, read at call time); this is the
// chrome's own expression, for a load-order slip.
const BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';

// The role's mark (rings, washes) and its words' colour: trainer rust; nutritionist gold, deeper on a
// light paper (the owner's pair for the Coaches tab).
function mktDirRole(t, nutri) {
  return nutri
    ? { mark: t.isLight ? '#a07a2e' : '#d8b25a', text: t.isLight ? '#a07a2e' : '#d8b25a' }
    : { mark: '#c0533b', text: '#c0533b' };
}
const mktDirRoleWord = (tr, nutri) => (nutri
  ? tr('marketplace:role.nutritionist', { defaultValue: 'Nutritionist' })
  : tr('marketplace:role.trainer', { defaultValue: 'Trainer' }));

// Two initials, a "Dr." left off ("Dr. Kevin Park" is KP).
function mktDirInitials(name) {
  const p = String(name || '').replace(/^dr\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || '·';
}

// A price with its unit: "$110/session", "$140/month".
const mktDirPriceText = (tr, price) => (!price ? null : price.per === 'month'
  ? tr('marketplace:price.perMonth', { defaultValue: '${amount}/month', amount: price.amount })
  : tr('marketplace:price.perSession', { defaultValue: '${amount}/session', amount: price.amount }));

// Focus rings, the search's placeholder, the slider's colour, scoped to the page and its sheet.
const MKT_DIR_CSS = (teal, ph) => `[data-mkt-dir] input::placeholder,[data-mkt-sheet] input::placeholder{color:${ph}}`
  + `[data-mkt-dir] [data-mkt-search]:focus-within{box-shadow:0 0 0 2px ${teal}}`
  + `[data-mkt-dir] [data-mkt-select]:focus-within [data-mkt-select-face],[data-mkt-sheet] [data-mkt-select]:focus-within [data-mkt-select-face]{box-shadow:0 0 0 2px ${teal}}`
  + `[data-mkt-dir] button:focus-visible,[data-mkt-sheet] button:focus-visible,[data-mkt-sheet] input[type=range]:focus-visible{outline:2px solid ${teal};outline-offset:2px}`
  + `[data-mkt-dir] [data-mkt-press]{transition:transform 140ms ease}[data-mkt-dir] [data-mkt-press]:active{transform:scale(0.985)}`
  + `[data-mkt-dir] [data-mkt-chips]::-webkit-scrollbar,[data-mkt-dir] [data-mkt-shelf]::-webkit-scrollbar{display:none}`
  + `@media (prefers-reduced-motion:reduce){[data-mkt-dir] [data-mkt-press]{transition:none}[data-mkt-dir] [data-mkt-press]:active{transform:none}}`;

// A coach's face: their photo in a ring of their role's mark, or their initials on a wash of it when
// there is no photo or it fails to load. The name beside it says who it is, so it is hidden.
function MktDirFace({ photo, name, nutri, size = 44 }) {
  const { useBS } = window;
  const t = useBS();
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [photo]);
  const role = mktDirRole(t, nutri);
  const box = { width: size, height: size, flexShrink: 0, borderRadius: 999, boxSizing: 'border-box', border: `2px solid ${role.mark}` };
  if (photo && !broken) {
    return <img data-mkt-face="photo" src={photo} alt="" aria-hidden="true" onError={() => setBroken(true)} style={{ ...box, display: 'block', objectFit: 'cover', background: t.PAPER2 }} />;
  }
  return (
    <span data-mkt-face="initials" aria-hidden="true" style={{ ...box, display: 'grid', placeItems: 'center', background: `linear-gradient(${bsDashA(role.mark, t.isLight ? 0.16 : 0.26)}, ${bsDashA(role.mark, t.isLight ? 0.16 : 0.26)}), ${t.PAPER}`, color: role.text, fontFamily: t.HEAD || t.DISPLAY, fontSize: Math.round(size * 0.34), fontWeight: 700, letterSpacing: '-0.01em' }}>
      {mktDirInitials(name)}
    </span>
  );
}

// A section's head: a clean title (no kicker) and, on its right, a quiet note or a control.
function MktDirHead({ title, aside = null, size = 17 }) {
  const { useBS } = window;
  const t = useBS();
  return (
    <div data-mkt-head="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 32 }}>
      <h2 style={{ margin: 0, minWidth: 0, fontFamily: t.HEAD || t.DISPLAY, fontSize: size, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: t.INK }}>{title}</h2>
      {aside ? <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>{aside}</div> : null}
    </div>
  );
}

// A picker as words with a chevron: the phone's own list laid over it, in a 44px target. `text` is
// what the face reads when it is not the option's own words (the role chip reads Both, its list Both · 41).
function MktDirSelect({ value, options, onChange, label, face, style = null, text = null }) {
  const { useBS } = window;
  const t = useBS();
  return (
    <span data-mkt-select="" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minHeight: 44, maxWidth: '100%', flex: 'none', ...style }}>
      <span data-mkt-select-face="" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', borderRadius: 999, whiteSpace: 'nowrap', ...face }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text != null ? text : (options.find(([v]) => v === value) || options[0] || [value, value])[1]}</span>
        <svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', opacity: 0.7 }}><path d="M1 1l3.5 3.5L8 1" /></svg>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer', fontSize: 16, border: 0, WebkitAppearance: 'none', appearance: 'none', color: t.INK, background: t.PAPER }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}

// ─── YOUR TEAM ───────────────────────────────────────────────────────────────────────────────────
// The coaches the member pays, each a row with Message (its unread count beside it), as Home's Team
// names them; the signed-out preview's sample two read Example. team: [{ key, name, nutri, photo, unread, example, onMessage }].
function MktDirTeam({ team }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  return (
    <section data-mkt-team="" style={{ marginTop: 14 }}>
      <MktDirHead title={tr('marketplace:team.title', { defaultValue: 'Your team' })}
        aside={<span style={{ fontFamily: t.DISPLAY, fontSize: 12, fontWeight: 500, color: t.INK70 }}>{tr('marketplace:team.count', { defaultValue: '{count, plural, one {# coach} other {# coaches}}', count: team.length })}</span>} />
      <div style={{ marginTop: 2 }}>
        {team.map((c, i) => {
          const role = mktDirRole(t, c.nutri);
          const roleWord = mktDirRoleWord(tr, c.nutri);
          const name = c.name || roleWord;
          const unread = c.unread > 0 ? tr('marketplace:team.unread', { defaultValue: '{n} new', n: c.unread }) : '';
          return (
            <div key={c.key} data-mkt-team-row="" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 58, borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
              <MktDirFace photo={c.photo} name={name} nutri={c.nutri} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: t.HEAD || t.DISPLAY, fontSize: 15, fontWeight: 650, letterSpacing: '-0.015em', color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1, fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 600, color: role.text }}>{roleWord}{c.example ? <MktDirExample /> : null}</span>
              </span>
              <button type="button" data-mkt-team-message="" onClick={c.onMessage}
                aria-label={[tr('marketplace:team.messageAria', { defaultValue: 'Message {name}', name }), unread].filter(Boolean).join(', ')}
                style={{ flex: 'none', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', borderRadius: 999, border: `1px solid ${bsDashA(t.INK, 0.2)}`, color: t.INK, fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {tr('marketplace:team.message', { defaultValue: 'Message' })}
                  {unread ? <span style={{ color: bsDash(t).text.teal }}>· {unread}</span> : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── THE FILTERS (the owner's option 1, 2026-11-09) ──────────────────────────────────────────────
// The one component the filter treatment lives in: the search with the Filters button at its right
// end (a teal count of the filters on, beyond the role), one scrolling row under it (the role as its
// first chip, a picker; then each filter on as a chip that takes it off), and the one sheet behind
// the button. What it reads (the marketplace module's `filters`):
//   role, roles [{ key, count }], onRole        the role ('Both' | 'Trainers' | 'Nutritionists')
//   applied [{ key, label, onRemove }]          each filter on
//   open, onOpen, onClose, onClear, total       the sheet; Clear all; the coaches it would show
//   goals [{ key, label, count, on, onToggle }] the goals, each with its count
//   city { value, options, onChange } | null    null: no listing states a city
//   budget { session, month }                   each { min, max, step, value, onChange } | null
//   meet { value, onChange } | null             null: no listing says how it meets
//   openWeek { on, count, onToggle }
function BSMktFilters({ query = '', onQuery, filters }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const teal = D.mark.teal;
  const f = filters || {};
  const applied = Array.isArray(f.applied) ? f.applied : [];
  const hint = tr('marketplace:dir.searchCoaches', { defaultValue: 'Name or specialty' });
  const roleWord = (r) => (r === 'Trainers' ? tr('marketplace:dir.tabTrainers', { defaultValue: 'Trainers' })
    : r === 'Nutritionists' ? tr('marketplace:dir.tabNutritionists', { defaultValue: 'Nutritionists' })
      : tr('marketplace:dir.tabBoth', { defaultValue: 'Both' }));
  const surface = (typeof document !== 'undefined' && document.getElementById && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  const chipFace = { height: 30, boxSizing: 'border-box', padding: '0 10px 0 12px', fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' };
  return (
    <div data-mkt-filters="">
      <div data-mkt-search="" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '0 3px 0 12px', boxSizing: 'border-box', borderRadius: 14, background: D.track, border: `1px solid ${D.border}` }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.INK70} strokeWidth="2.2" strokeLinecap="round" style={{ flex: 'none' }}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </svg>
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={hint} aria-label={hint} enterKeyHint="search" autoComplete="off"
          style={{ flex: 1, minWidth: 0, minHeight: 42, border: 0, outline: 'none', background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, letterSpacing: '-0.005em', padding: 0, textOverflow: 'ellipsis' }} />
        {query ? (
          <button type="button" onClick={() => onQuery('')} aria-label={tr('marketplace:dir.clearSearch', { defaultValue: 'Clear search' })}
            style={{ flex: 'none', width: 36, minHeight: 44, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', cursor: 'pointer', color: t.INK70, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        ) : null}
        <button type="button" data-mkt-filters-open="" onClick={f.onOpen} aria-haspopup="dialog"
          aria-label={[tr('marketplace:filters.button', { defaultValue: 'Filters' }), applied.length ? tr('marketplace:filters.onCount', { defaultValue: '{count, plural, one {# on} other {# on}}', count: applied.length }) : null].filter(Boolean).join(', ')}
          style={{ flex: 'none', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: applied.length ? '0 6px 0 10px' : '0 12px 0 10px', borderRadius: 11, background: t.PAPER, border: `1px solid ${D.border}`, color: t.INK, fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap' }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1.5 4h11M1.5 10h11" />
              <circle cx="4.6" cy="4" r="1.9" fill={t.PAPER} />
              <circle cx="9.4" cy="10" r="1.9" fill={t.PAPER} />
            </svg>
            {tr('marketplace:filters.button', { defaultValue: 'Filters' })}
            {applied.length ? <span data-mkt-filters-count="" style={{ display: 'grid', placeItems: 'center', minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 99, background: teal, color: t.isLight ? '#ffffff' : '#06201d', fontSize: 10.5, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>{applied.length}</span> : null}
          </span>
        </button>
      </div>

      {/* One row: the role first (a picker), then each filter on, which a tap takes off. It scrolls
          sideways when it runs past the page, so it never wraps or squeezes a target. */}
      <div data-mkt-chips="" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, marginRight: -t.padX, paddingRight: t.padX, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <MktDirSelect value={f.role || 'Both'} onChange={f.onRole} text={roleWord(f.role || 'Both')}
          label={tr('marketplace:filters.roleAria', { defaultValue: 'Show trainers, nutritionists or both' })}
          options={(f.roles || [{ key: 'Both' }, { key: 'Trainers' }, { key: 'Nutritionists' }]).map((r) => [r.key, r.count != null ? `${roleWord(r.key)} · ${r.count}` : roleWord(r.key)])}
          face={{ ...chipFace, border: `1px solid ${bsDashA(t.INK, 0.2)}`, color: t.INK }} />
        {applied.map((a) => (
          <button key={a.key} type="button" data-mkt-applied={a.key} onClick={a.onRemove}
            aria-label={tr('marketplace:filters.remove', { defaultValue: 'Remove {label}', label: a.label })}
            style={{ flex: 'none', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <span style={{ ...chipFace, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, whiteSpace: 'nowrap', background: bsDashA(teal, t.isLight ? 0.12 : 0.16), border: `1px solid ${bsDashA(teal, 0.45)}`, color: D.text.teal }}>
              {a.label}<span aria-hidden="true" style={{ fontSize: 15, fontWeight: 500, lineHeight: 1 }}>×</span>
            </span>
          </button>
        ))}
      </div>

      {/* The sheet portals into the phone surface, over the nav; with no surface it draws in place. */}
      {f.open ? (surface ? createPortal(bsCleanSheet(t, <MktDirFilterSheet f={f} />), surface) : bsCleanSheet(t, <MktDirFilterSheet f={f} />)) : null}
    </div>
  );
}

// The sheet behind the Filters button: Goal, City, Budget, How you meet and Open intro this week, then
// Clear all and Show {n} coaches. A section the listings carry nothing for says "Not listed yet",
// so no choice promises a match nobody has.
function MktDirFilterSheet({ f }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const teal = D.mark.teal;
  const hair = `1px solid ${t.HAIR}`;
  const label = { fontFamily: t.DISPLAY, fontSize: 12, fontWeight: 650, letterSpacing: '0.01em', color: t.INK70 };
  const note = { fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50 };
  const group = (title, body, aside = null) => (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <span style={label}>{title}</span>
        {aside}
      </div>
      {body}
    </div>
  );
  const notListed = <div data-mkt-not-listed="" style={note}>{tr('marketplace:filters.notListed', { defaultValue: 'Not listed yet' })}</div>;
  const money = (amount) => tr('marketplace:filters.amount', { defaultValue: '${amount}', amount });
  const slider = (unit, b) => {
    const at = b.value == null ? b.max : b.value;
    return (
      <div key={unit} data-mkt-budget={unit} style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70 }}>
          <span>{unit === 'month' ? tr('marketplace:filters.perMonth', { defaultValue: 'Per month' }) : tr('marketplace:filters.perSession', { defaultValue: 'Per session' })}</span>
          <span style={{ color: t.INK, fontWeight: 650 }}>{b.value == null ? tr('marketplace:filters.anyBudget', { defaultValue: 'Any budget' }) : tr('marketplace:filters.upTo', { defaultValue: 'Up to {price}', price: money(b.value) })}</span>
        </div>
        <input type="range" min={b.min} max={b.max} step={b.step || 5} value={at}
          aria-label={unit === 'month' ? tr('marketplace:filters.budgetMonthAria', { defaultValue: 'Budget per month' }) : tr('marketplace:filters.budgetSessionAria', { defaultValue: 'Budget per session' })}
          onChange={(e) => { const v = Number(e.target.value); b.onChange(v >= b.max ? null : v); }}
          style={{ display: 'block', width: '100%', height: 44, margin: 0, accentColor: teal, background: 'transparent' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -6, fontFamily: t.DISPLAY, fontSize: 11.5, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>
          <span>{money(b.min)}</span>
          <span>{unit === 'month' ? tr('marketplace:filters.maxMonth', { defaultValue: '${amount}+ / month', amount: b.max }) : tr('marketplace:filters.maxSession', { defaultValue: '${amount}+ / session', amount: b.max })}</span>
        </div>
      </div>
    );
  };
  const budgets = [f.budget && f.budget.session ? slider('session', f.budget.session) : null, f.budget && f.budget.month ? slider('month', f.budget.month) : null].filter(Boolean);
  const meetOpts = [['inperson', tr('marketplace:meet.inPerson', { defaultValue: 'In person' })], ['remote', tr('marketplace:meet.remote', { defaultValue: 'Remote' })], ['either', tr('marketplace:meet.either', { defaultValue: 'Either' })]];
  const ow = f.openWeek || { on: false, count: 0, onToggle() {} };
  return (
    <div data-mkt-sheet="" onClick={f.onClose} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(6,5,4,0.48)', display: 'flex', alignItems: 'flex-end' }}>
      <style>{MKT_DIR_CSS(teal, t.INK50)}</style>
      <div ref={bsDialogRef(f.onClose)} role="dialog" aria-modal="true" aria-label={tr('marketplace:filters.title', { defaultValue: 'Filters' })} onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '88%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${bsDashA(t.INK, 0.12)}`, boxShadow: '0 -18px 40px rgba(0,0,0,0.35)' }}>
        <div aria-hidden="true" style={{ width: 36, height: 4, borderRadius: 9, background: bsDashA(t.INK, 0.22), margin: '8px auto 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: `2px ${t.padX - 6}px 0 ${t.padX}px` }}>
          <h2 style={{ margin: 0, fontFamily: t.HEAD || t.DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{tr('marketplace:filters.title', { defaultValue: 'Filters' })}</h2>
          <button type="button" data-mkt-sheet-close="" onClick={f.onClose} aria-label={tr('marketplace:filters.close', { defaultValue: 'Close' })}
            style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 99, display: 'grid', placeItems: 'center', background: D.track, color: t.INK, fontSize: 17, lineHeight: 1 }}>×</span>
          </button>
        </div>

        <div className="bs-scroll" data-bs-noswipe="" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: `0 ${t.padX}px 14px` }}>
          {group(tr('marketplace:filters.goal', { defaultValue: 'Goal' }), (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 6px' }}>
              {(f.goals || []).map((g) => (
                <button key={g.key} type="button" data-mkt-goal={g.key} aria-pressed={!!g.on} onClick={g.onToggle}
                  style={{ minWidth: 0, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
                  {/* A long goal ("Prenatal & postnatal") takes a second line rather than losing its end. */}
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 36, padding: '7px 11px', borderRadius: 11, boxSizing: 'border-box', textAlign: 'left',
                    background: g.on ? t.INK : D.track, color: g.on ? t.PAPER : t.INK, border: `1px solid ${g.on ? t.INK : D.border}`, fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{g.label}</span>
                    <span style={{ flex: 'none', fontWeight: 650, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{g.count}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}

          {group(tr('marketplace:filters.city', { defaultValue: 'City' }), f.city ? (
            <MktDirSelect value={f.city.value} onChange={f.city.onChange} label={tr('marketplace:filters.city', { defaultValue: 'City' })}
              options={f.city.options.map((c) => [c, c === 'Anywhere' ? tr('marketplace:filters.anywhere', { defaultValue: 'Anywhere' }) : c])}
              style={{ display: 'flex', width: '100%' }}
              face={{ width: '100%', boxSizing: 'border-box', height: 44, padding: '0 14px', borderRadius: 12, justifyContent: 'space-between', background: D.track, border: `1px solid ${D.border}`, color: t.INK, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 500 }} />
          ) : notListed)}

          {group(tr('marketplace:filters.budget', { defaultValue: 'Budget' }), budgets.length ? budgets : notListed)}

          {group(tr('marketplace:filters.meet', { defaultValue: 'How you meet' }), f.meet ? (
            <div role="radiogroup" aria-label={tr('marketplace:filters.meet', { defaultValue: 'How you meet' })} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 3px', borderRadius: 13, background: D.track, minHeight: 44 }}>
              {meetOpts.map(([k, l]) => {
                const on = f.meet.value === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} data-mkt-meet={k} onClick={() => f.meet.onChange(k)}
                    style={{ flex: '1 1 0', minWidth: 0, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
                    <span style={{ display: 'block', height: 34, lineHeight: '34px', borderRadius: 10, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70, fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>
                  </button>
                );
              })}
            </div>
          ) : notListed)}

          {/* Open intro this week: a switch, with how many coaches it would leave. */}
          <button type="button" role="switch" aria-checked={!!ow.on} data-mkt-open-week="" onClick={ow.onToggle}
            style={{ marginTop: 18, width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 12px 0 14px', boxSizing: 'border-box', borderRadius: 14, border: `1px solid ${D.border}`, background: D.track, cursor: 'pointer', color: t.INK, textAlign: 'left' }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600 }}>
              {tr('marketplace:filters.openWeek', { defaultValue: 'Open intro this week' })}<span style={{ color: t.INK50, fontWeight: 500 }}> · {ow.count}</span>
            </span>
            <span aria-hidden="true" style={{ position: 'relative', flex: 'none', width: 44, height: 26, borderRadius: 99, background: ow.on ? teal : bsDashA(t.INK, 0.2), transition: 'background .18s ease' }}>
              <span style={{ position: 'absolute', top: 3, left: ow.on ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: t.isLight ? '#ffffff' : t.PAPER, boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left .18s ease' }} />
            </span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: `10px ${t.padX}px calc(12px + env(safe-area-inset-bottom, 0px))`, borderTop: hair }}>
          <button type="button" data-mkt-clear-all="" onClick={f.onClear}
            style={{ flex: 'none', minHeight: 44, padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 650, textDecoration: 'underline', textUnderlineOffset: 4 }}>
            {tr('marketplace:filters.clearAll', { defaultValue: 'Clear all' })}
          </button>
          <button type="button" data-mkt-show="" onClick={f.onClose}
            style={{ flex: '1 1 auto', maxWidth: 220, minHeight: 48, padding: '0 18px', border: 0, borderRadius: 999, background: teal, color: t.isLight ? '#ffffff' : '#06201d', cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700 }}>
            {tr('marketplace:filters.show', { defaultValue: '{count, plural, one {Show # coach} other {Show # coaches}}', count: f.total || 0 })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── A COACH ─────────────────────────────────────────────────────────────────────────────────────
// The rating as the row prints it: "★ 9.8", or New for a coach nobody has reviewed (never a number).
function MktDirRating({ score, pal = null }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  if (score == null || !(Number(score) > 0)) {
    return <span data-mkt-rating="new" aria-label={tr('marketplace:dir.newAria', { defaultValue: 'New · no reviews yet' })} style={{ color: pal ? pal.INK_SOFT : t.INK70, fontWeight: 600 }}>{tr('marketplace:rating.new', { defaultValue: 'New' })}</span>;
  }
  return (
    <span data-mkt-rating="" aria-label={tr('marketplace:dir.ratingAria', { defaultValue: 'Rated {score} out of 10', score: Number(score).toFixed(1) })}>
      <span aria-hidden="true">★ </span><b style={{ color: pal ? pal.INK : t.INK, fontWeight: 700 }}>{Number(score).toFixed(1)}</b>
    </span>
  );
}

// The line under a coach: Example on a sample, ★ rating · price with its unit · the next open intro
// (teal), or At capacity (amber). Each part stays whole; a narrow phone takes the line onto two, so the
// name above keeps the row's width beside Book intro.
function MktDirMeta({ card, size = 12.5, pal = null }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const price = mktDirPriceText(tr, card.price);
  const parts = [
    ['rating', <MktDirRating score={card.score} pal={pal} />],
    price ? ['price', price] : null,
    card.next ? ['next', <span style={{ color: card.next.full ? (pal ? pal.CTA_TEXT : (t.AMBER || '#d8a23a')) : (pal ? pal.ACCENT : D.text.teal), fontWeight: 600 }}>{card.next.text}</span>] : null,
  ].filter(Boolean);
  return (
    <span data-mkt-meta="" style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: size, fontWeight: 500, lineHeight: 1.45, color: pal ? pal.INK_SOFT : t.INK70, fontVariantNumeric: 'tabular-nums' }}>
      {card.example ? <span style={{ display: 'inline-flex', verticalAlign: 'text-bottom', marginRight: 6 }}><MktDirExample /></span> : null}
      {parts.map(([k, v], i) => (
        <React.Fragment key={k}>
          {i ? <span aria-hidden="true"> · </span> : null}
          <span data-mkt-part={k} style={{ whiteSpace: 'nowrap' }}>{v}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

// "Example" on a sample coach (the website's label), so no example passes for a real one.
function MktDirExample() {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  return (
    <span data-mkt-example="" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: 99, border: `1px solid ${bsDashA(t.INK, 0.22)}`, color: t.INK70, fontFamily: t.DISPLAY, fontSize: 10.5, fontWeight: 650, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
      {tr('marketplace:dir.example', { defaultValue: 'Example' })}
    </span>
  );
}

// ⚠ THE COACH'S OWN LOOK ON THEIR CARD (owner, 2026-11-11: "make the coach cards look the same also on
// marketplace on app", after the website's Coaches card took it in #2706). card.look is
// services/coachCardLook.mjs's: their paper and accent (the kit's palette, the website card's own), the climb
// background's wash and their cover photo at its dragged spot, under a scrim of the paper so every word
// keeps the palette's 4.5:1. With no look the row is the directory's own.
function mktDirLookBg(look) {
  const P = look.pal;
  const layers = [];
  if (look.wash) layers.push(look.wash);
  // The card is the paper itself (with steel's sheen), as the website's card (--card, --card-sheen; Codex on #2708).
  const rgb = P.P1_RGB || P.BG_RGB;
  if (look.cover) layers.push(`linear-gradient(90deg, rgba(${rgb},0.95) 45%, rgba(${rgb},0.82))`, `url(${JSON.stringify(look.cover)}) ${look.coverPos || 'center 50%'} / cover no-repeat`);
  if (P.PAPER_SHEEN) layers.push(P.PAPER_SHEEN);
  layers.push(P.PAPER || P.BG);
  return layers.join(', ');
}

// A coach in the list: one row. The row opens them (their profile); Book intro, laid over its corner
// (never inside the row's button), opens their page at its open times. A coach who is full reads
// At capacity, and the corner says Waiting list.
function MktDirRow({ card, first = false }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const role = mktDirRole(t, card.nutri);
  const spec = [mktDirRoleWord(tr, card.nutri), ...(card.spec || [])].join(' · ');
  const full = !!(card.next && card.next.full);
  const look = card.look || null;
  const P = look ? look.pal : null;
  return (
    <div data-mkt-row="" data-mkt-look={look ? (look.picked ? (P.paperKey || 'accent') : 'climb') : undefined}
      style={look ? { position: 'relative', margin: first ? '4px 0 0' : '8px 0 0', padding: '0 12px', borderRadius: 14, border: `1px solid rgba(${P.inkRGB},0.16)`, background: mktDirLookBg(look), overflow: 'hidden' }
        : { position: 'relative', borderTop: first ? 0 : `1px solid ${t.HAIR}` }}>
      <button type="button" data-mkt-open="" data-mkt-press="" onClick={card.onOpen}
        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 72, padding: '12px 0', boxSizing: 'border-box', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: P ? P.INK : t.INK }}>
        <span style={{ display: 'block', opacity: card.atCapacity && full ? 0.6 : 1 }}><MktDirFace photo={card.photo} name={card.name} nutri={card.nutri} size={46} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', paddingRight: 104 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ minWidth: 0, fontFamily: t.HEAD || t.DISPLAY, fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25, color: P ? P.INK : t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</span>
              {card.verified ? <span data-mkt-verified="" role="img" aria-label={tr('marketplace:dir.verified', { defaultValue: 'Verified' })} style={{ flex: 'none', color: P ? P.ACCENT : D.mark.teal, fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span> : null}
            </span>
            <span data-mkt-spec="" style={{ display: 'block', marginTop: 2, fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, color: P ? P.CTA_TEXT : role.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spec}</span>
          </span>
          <span style={{ display: 'block', marginTop: 3 }}><MktDirMeta card={card} pal={P} /></span>
        </span>
      </button>
      <button type="button" data-mkt-intro="" onClick={card.onIntro}
        aria-label={full ? tr('marketplace:dir.waitingListAria', { defaultValue: 'Join {name}’s waiting list', name: card.name }) : tr('marketplace:dir.bookIntroAria', { defaultValue: 'Book an intro with {name}', name: card.name })}
        style={{ position: 'absolute', top: 6, right: look ? 12 : 0, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 12px', borderRadius: 999, border: `1px solid ${P ? `rgba(${P.inkRGB},0.28)` : bsDashA(t.INK, 0.2)}`, background: P ? P.DEEP : D.track, color: P ? P.INK : t.INK, fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap' }}>
          {full ? tr('marketplace:dir.waitingList', { defaultValue: 'Waiting list' }) : tr('marketplace:dir.bookIntro', { defaultValue: 'Book intro' })}
        </span>
      </button>
    </div>
  );
}

// An editors' pick: a compact card on the shelf, the whole card one button.
function MktDirPick({ card }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const role = mktDirRole(t, card.nutri);
  const price = card.price ? mktDirPriceText(tr, card.price) : null;
  const look = card.look || null;
  const P = look ? look.pal : null;
  return (
    <button type="button" data-mkt-pick="" data-mkt-press="" onClick={card.onOpen} data-mkt-look={look ? (look.picked ? (P.paperKey || 'accent') : 'climb') : undefined}
      style={{ flex: 'none', width: 144, minHeight: 132, padding: '12px 10px 11px', boxSizing: 'border-box', borderRadius: 16, border: `1px solid ${P ? `rgba(${P.inkRGB},0.18)` : D.border}`, background: look ? mktDirLookBg(look) : D.card, boxShadow: D.shadow, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', cursor: 'pointer', color: P ? P.INK : t.INK }}>
      <MktDirFace photo={card.photo} name={card.name} nutri={card.nutri} size={40} />
      <span style={{ maxWidth: '100%', fontFamily: t.HEAD || t.DISPLAY, fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</span>
      <span style={{ maxWidth: '100%', marginTop: -4, fontFamily: t.DISPLAY, fontSize: 11.5, fontWeight: 600, color: P ? P.CTA_TEXT : role.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {mktDirRoleWord(tr, card.nutri)}{card.example ? <span style={{ color: P ? P.INK_MUTED : t.INK50 }}> · {tr('marketplace:dir.example', { defaultValue: 'Example' })}</span> : null}
      </span>
      <span style={{ maxWidth: '100%', fontFamily: t.DISPLAY, fontSize: 11.5, fontWeight: 500, color: P ? P.INK_SOFT : t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
        <MktDirRating score={card.score} pal={P} />{price ? ` · ${price}` : ''}
      </span>
    </button>
  );
}

// A plan in What's hot: its name, its coach's role and name, its price, one button to the coach.
function MktDirPlanRow({ plan, first = false }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const role = mktDirRole(t, plan.nutri);
  return (
    <button type="button" data-mkt-plan="" onClick={plan.onOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 58, padding: '9px 0', boxSizing: 'border-box', border: 0, borderTop: first ? 0 : `1px solid ${t.HAIR}`, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: t.INK }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ minWidth: 0, fontFamily: t.HEAD || t.DISPLAY, fontSize: 14.5, fontWeight: 650, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.title}</span>
          {plan.example ? <MktDirExample /> : null}
        </span>
        <span style={{ display: 'block', marginTop: 2, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: role.text, fontWeight: 600 }}>{mktDirRoleWord(tr, plan.nutri)}</span>{plan.coach ? ` · ${plan.coach}` : ''}
        </span>
      </span>
      <span style={{ flex: 'none', fontFamily: t.HEAD || t.DISPLAY, fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{plan.price || tr('marketplace:dir.view', { defaultValue: 'View' })}</span>
    </button>
  );
}

// What's hot's kinds: a quiet switch, each key a 44px target holding a 30px pill.
function MktDirSwitch({ options, value, onChange, label }) {
  const { useBS } = window;
  const t = useBS();
  const D = bsDash(t);
  return (
    <div role="group" aria-label={label} data-mkt-switch="" style={{ display: 'flex', alignItems: 'center', gap: 2, height: 36, padding: '0 3px', boxSizing: 'border-box', borderRadius: 12, background: D.track }}>
      {options.map(([k, l]) => {
        const on = k === value;
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => onChange(k)} style={{ flex: '1 1 0', minWidth: 0, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <span style={{ display: 'block', height: 30, lineHeight: '30px', padding: '0 8px', borderRadius: 9, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70, fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', transition: 'background .18s ease, color .18s ease' }}>{l}</span>
          </button>
        );
      })}
    </div>
  );
}

// The application door: one slim line at the foot, on every role and while searching.
function MktDirApply({ onApply }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  return (
    <div data-mkt-apply="" style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}` }}>
      <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK }}>{tr('marketplace:apply.line', { defaultValue: 'Coaching on Shape?' })}</span>
      <button type="button" data-mkt-apply-go="" onClick={onApply} style={{ flex: 'none', minHeight: 48, padding: '0 2px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: D.text.teal }}>
        {tr('marketplace:apply.apply', { defaultValue: 'Apply →' })}
      </button>
    </div>
  );
}

// The page, off what the marketplace module hands it:
//   onBack, corner               a pushed page's ← Back (none on the tab), the masthead's tool pill
//   team                         Your team's rows, or []
//   query, onQuery, filters      the search and BSMktFilters' state (see it)
//   loading, error               the live directory's read
//   deepMiss, onDeepMissDismiss  a deep link to a coach who is not listed
//   picks, list, listKind        Editors' picks and the list (cards); how the head counts them:
//                                'bookable' | 'example' | 'listed'
//   sort, sorts, onSort          the list's order
//   planTab, onPlanTab, plans    What's hot, one kind at a time
//   onApply                      the application door
export function BSMarketDirectory({
  onBack = null, corner = null, team = [], query = '', onQuery, filters = null,
  loading = false, error = '', deepMiss = false, onDeepMissDismiss, picks = [], list = [], listKind = 'bookable',
  sort = 'best', sorts = ['best', 'rated', 'price', 'years'], onSort, planTab = 'program', onPlanTab, plans = [], onApply,
}) {
  const { useBS, BSPage, BSFooter, BSBackRow, BSLogo } = window;
  const base = useBS();
  const t = useBSClean();
  const tr = useShapeTr();
  const D = bsDash(t);
  const mastTop = window.BS_MAST_TOP_CSS || BS_MAST_TOP_CSS;
  const sortWord = (s) => ({
    best: tr('marketplace:sort.best', { defaultValue: 'Best match' }),
    rated: tr('marketplace:sort.highestRated', { defaultValue: 'Highest rated' }),
    price: tr('marketplace:sort.priceLowHigh', { defaultValue: 'Price low to high' }),
    years: tr('marketplace:sort.mostExperience', { defaultValue: 'Most experience' }),
  }[s] || s);
  const planTabs = [
    ['program', tr('marketplace:plan.programs', { defaultValue: 'Programs' }), tr('marketplace:plan.programsLower', { defaultValue: 'programs' })],
    ['workout', tr('marketplace:plan.workouts', { defaultValue: 'Workouts' }), tr('marketplace:plan.workoutsLower', { defaultValue: 'workouts' })],
    ['meal', tr('marketplace:plan.mealPlans', { defaultValue: 'Meal plans' }), tr('marketplace:plan.mealPlansLower', { defaultValue: 'meal plans' })],
  ];
  const head = listKind === 'example'
    ? tr('marketplace:dir.countExample', { defaultValue: '{count, plural, one {# example coach} other {# example coaches}}', count: list.length })
    : listKind === 'listed'
      ? tr('marketplace:dir.countListed', { defaultValue: '{count, plural, one {# coach} other {# coaches}}', count: list.length })
      : tr('marketplace:dir.countBookable', { defaultValue: '{count, plural, one {# coach you can book} other {# coaches you can book}}', count: list.length });
  const anyExample = list.some((c) => c.example) || picks.some((c) => c.example) || (team || []).some((c) => c.example);
  const applied = filters && Array.isArray(filters.applied) ? filters.applied : [];
  const note = { fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.45, color: t.INK50 };

  return (
    <BSPage>
      {/* The standing masthead row (the mark and the tool pill); a pushed page's ← Back under it. */}
      <div style={{ padding: `${mastTop} ${base.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: window.BS_MAST_ROW_H || 34 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {window.BSMastBackSlot ? <window.BSMastBackSlot /> : null}
            {BSLogo ? <BSLogo size={window.BS_MAST_LOGO || 26} color={base.INK} /> : null}
          </div>
          {corner}
        </div>
        {onBack && BSBackRow ? <BSBackRow onBack={onBack} /> : null}
      </div>

      <BSCleanType t={t}>
        <div data-mkt-dir="" style={{ padding: `10px ${t.padX}px 0` }}>
          <style>{MKT_DIR_CSS(D.mark.teal, t.INK50)}</style>
          <h1 style={{ margin: 0, fontFamily: t.HEAD || t.DISPLAY, fontSize: 32, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05, color: t.INK }}>
            {tr('marketplace:dir.title', { defaultValue: 'Coaches' })}<span aria-hidden="true" style={{ color: D.mark.teal }}>.</span>
          </h1>

          {team && team.length ? <MktDirTeam team={team} /> : null}
          {team && team.length ? <div style={{ marginTop: 18 }}><MktDirHead title={tr('marketplace:dir.findCoach', { defaultValue: 'Find a coach' })} /></div> : null}

          <div style={{ marginTop: team && team.length ? 4 : 14 }}>
            <BSMktFilters query={query} onQuery={onQuery} filters={filters} />
          </div>

          {(loading || error) ? (
            <div data-mkt-status="" style={{ ...note, marginTop: 6, color: error ? (t.RUST || '#c0533b') : t.INK50 }}>
              {loading ? tr('marketplace:dir.syncingProviders', { defaultValue: 'Syncing live providers…' }) : tr('marketplace:dir.demoData', { defaultValue: 'Demo data · {error}', error })}
            </div>
          ) : null}

          {deepMiss ? (
            <div role="status" style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center', border: `1px solid ${t.AMBER}66`, borderRadius: 14, background: `${t.AMBER}12`, padding: '4px 4px 4px 14px' }}>
              <span style={{ flex: 1, padding: '8px 0', fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK }}>{tr('marketplace:dir.coachNotOpen', { defaultValue: "That coach's listing isn't open yet. They'll appear here once it is." })}</span>
              <button type="button" onClick={onDeepMissDismiss} aria-label={tr('marketplace:dir.coachNotOpenDismiss', { defaultValue: 'Dismiss' })} style={{ flex: 'none', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: t.INK70 }}>×</button>
            </div>
          ) : null}

          {/* Editors' picks: a shelf, scrolling sideways. */}
          {picks.length ? (
            <div data-mkt-picks="" style={{ marginTop: 14 }}>
              <MktDirHead size={15} title={tr('marketplace:dir.picks', { defaultValue: 'Editors’ picks' })}
                aside={<span style={{ fontFamily: t.DISPLAY, fontSize: 12, color: t.INK50 }}>{tr('marketplace:dir.picksBy', { defaultValue: 'Chosen by Shape' })}</span>} />
              <div data-mkt-shelf="" style={{ display: 'flex', gap: 8, marginTop: 6, marginRight: -t.padX, paddingRight: t.padX, paddingBottom: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
                {picks.map((c) => <MktDirPick key={c.key} card={c} />)}
              </div>
            </div>
          ) : null}

          {/* The list: its count and the sort, then a row a coach. */}
          <div data-mkt-list="" style={{ marginTop: 16 }}>
            <MktDirHead title={head}
              aside={<MktDirSelect value={sort} onChange={onSort} label={tr('marketplace:sort.aria', { defaultValue: 'Sort by' })}
                options={sorts.map((s) => [s, sortWord(s)])} face={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, color: t.INK70 }} />} />
            <div data-mkt-rows="">
              {list.map((c, i) => <MktDirRow key={c.key} card={c} first={i === 0} />)}
            </div>
            {list.length === 0 ? (
              <div data-mkt-empty="" style={{ padding: '14px 0 4px', fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.45, color: t.INK70 }}>
                {tr('marketplace:dir.noMatch', { defaultValue: 'No coaches match that — try a different filter.' })}
                {applied.length && filters.onClear ? (
                  <div><button type="button" data-mkt-clear="" onClick={filters.onClear} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 650, color: D.text.teal }}>{tr('marketplace:filters.clearAll', { defaultValue: 'Clear all' })}</button></div>
                ) : null}
              </div>
            ) : null}
            {anyExample ? <p data-mkt-example-note="" style={{ ...note, margin: '10px 0 0' }}>{tr('marketplace:dir.exampleNote', { defaultValue: 'Coaches marked Example are example profiles. Their ratings, prices and open times are examples too.' })}</p> : null}
          </div>

          {/* What's hot: published plans across coaches, one kind at a time, as quiet rows. */}
          <div data-mkt-plans="" style={{ marginTop: 26 }}>
            <MktDirHead title={tr('marketplace:dir.whatsHot', { defaultValue: "What's hot" })} />
            <div style={{ marginTop: 4 }}>
              <MktDirSwitch label={tr('marketplace:dir.whatsHot', { defaultValue: "What's hot" })} options={planTabs.map(([k, l]) => [k, l])} value={planTab} onChange={onPlanTab} />
            </div>
            <div style={{ marginTop: 4 }}>
              {plans.length === 0 ? (
                <div style={{ padding: '12px 0', fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>{tr('marketplace:dir.noPlansYet', { defaultValue: 'No {label} listed yet — check back soon.', label: (planTabs.find(([k]) => k === planTab) || [])[2] || '' })}</div>
              ) : plans.map((pl, i) => <MktDirPlanRow key={pl.key} plan={pl} first={i === 0} />)}
            </div>
          </div>

          {/* The application door, for coaches: on every role, and while searching. */}
          <MktDirApply onApply={onApply} />
        </div>
      </BSCleanType>

      <BSFooter right={tr('marketplace:footer.marketplace', { defaultValue: 'Marketplace' })} />
    </BSPage>
  );
}
