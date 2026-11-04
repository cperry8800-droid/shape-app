import React from 'react';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType } from './bsCleanType.jsx';
import { bsMpTile } from './BSMemberBento.jsx';
// ─── COACH CLIENTS ───────────────────────────────────────────────────────────────────────────────
// The coach app's Clients page, trainer and nutritionist (owner, 2026-11-04, of three looks drawn for it:
// "C for clients"; of every redesign: "keep designs simple … modern, appealing, easy to navigate, not
// overwhelming, not analog … really alive"; of the member profile: "this looks better", "make sure you have
// the facet avatar"; and of the first cut: "reduce the coloring and simplify UI more"). Top to bottom:
//   · "Clients." and ＋ Add, the page's one primary action;
//   · who needs you first: one card with their faces and how many, the other two figures under a hairline;
//     it opens Needs you;
//   · the four views (Needs you · On track · Past · All) as words with a thin bar under the picked one;
//   · the search, with the phase (ALL · CUT · BUILD · PEAK) as one small picker beside it;
//   · every client in one compact list: each group a small head inside it, each row the facet avatar, the
//     name, the reason (or the phase and facts), the week's figure and a quiet Message.
// The cards are the paper's own colour with soft depth (the profile's tile, lifted by a soft shadow). Colour
// is only a signal: the dot on a client's facet avatar (coral today, amber this week, green for new, teal on
// track), the week's figure, the picked view, and ＋ Add. Motion is a fade on arrival, a press that gives,
// the picked view's bar sliding, and a faint light breathing behind today's faces; none of it runs under
// reduced motion.
// ⚠ EVERY CLIENT HAS A MESSAGE ICON (owner, 2026-11-04: "every client should have a message icon like the
// top person does in clients so they can easily message"): a quiet round icon in a 44px target on every
// row; the rest of the row opens the client's file.
//
// ⚠ THIS MODULE ONLY DRAWS. BSProRosterView (iosAppBroadsheetPros.jsx) works out the roster, the counts, the
// four views, the search, the phase filter, the groups and their order, the figures, and owns every door
// (a client's file, Message, ＋ Add, the views, Clear filters); it hands them over as `model`, and the parts
// it already has (the masthead row, the payment mark, the add sheet) as `kit`.
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx), and this module
// never imports the client or the pros module.

const { useState, useEffect } = React;

function useShapeTr() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// ── Colour, depth and type ───────────────────────────────────────────────────────────────────────

const hexA = (c, a) => {
  const s = String(c || '');
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return `color-mix(in srgb, ${s || 'currentColor'} ${Math.round(a * 100)}%, transparent)`;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const inkA = (t, a) => `rgba(${t.inkRGB || (t.isLight ? '20,18,15' : '242,237,228')},${a})`;

// Each standing's colour, for its small signals: `hue` for a dot, `text` for a figure, a count or a mark at
// AA on either paper.
function pcTones(t) {
  const L = !!t.isLight;
  return {
    red: { hue: L ? '#d0573c' : '#ff7d61', text: L ? '#9c3b26' : '#f59c87' },
    amber: { hue: L ? '#c98a12' : '#f5bd4f', text: L ? '#7a5205' : '#eec56f' },
    new: { hue: L ? '#2f9a5a' : '#5fd391', text: L ? '#2c6436' : '#8fd6a5' },
    green: { hue: L ? '#0a8f87' : '#34d6c5', text: L ? '#07706a' : '#34d6c5' },
    past: { hue: inkA(t, 0.4), text: t.INK70 },
  };
}
const toneOf = (t, sev) => pcTones(t)[sev] || pcTones(t).green;
// A week's figure: teal while it holds, amber as it slips, coral under half.
const figTone = (t, pct) => (pct >= 75 ? toneOf(t, 'green') : pct >= 50 ? toneOf(t, 'amber') : toneOf(t, 'red'));
const tealText = (t) => (t.isLight ? '#07706a' : '#34d6c5');
// Words for a screen reader only (the week's measure after its figure).
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

const MAST_TOP = () => (typeof window !== 'undefined' && window.BS_MAST_TOP_CSS) || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';

// The motion, in one sheet. Every element's resting style is its finished state, so the page reads the
// same with motion off; a reader who asked for less motion gets none.
const PC_CSS = `
@keyframes bspc-in { from { opacity: 0; transform: translateY(8px); } }
@keyframes bspc-breathe { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
[data-pro-clients] button, [data-pro-clients] select { -webkit-tap-highlight-color: transparent; font: inherit; }
[data-pro-clients] button:focus-visible, [data-pro-clients] input:focus-visible, [data-pro-clients] select:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
[data-pro-clients] [data-pc-lift] { transition: transform 200ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms ease; }
[data-pro-clients] [data-pc-lift]:active { transform: translateY(1px) scale(0.985); }
@media (hover: hover) { [data-pro-clients] [data-pc-lift]:hover { transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) {
  [data-pro-clients] *, [data-pro-clients] *::before, [data-pro-clients] *::after { animation: none !important; transition: none !important; }
}
`;
const stagger = (i, step = 40, cap = 8) => `${Math.min(i, cap) * step}ms`;

// A card: the profile's quiet rounded tile (bsMpTile) in the paper's own colour, lifted off the page by a
// soft layered shadow and a lit top edge. No colour of its own.
function pcCard(t, { radius = 22 } = {}) {
  const tile = bsMpTile(t, t.INK);
  return {
    ...tile, position: 'relative', overflow: 'hidden', borderRadius: radius,
    background: t.isLight ? `linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.74)), ${t.PAPER}` : `linear-gradient(180deg, ${inkA(t, 0.075)}, ${inkA(t, 0.04)}), ${t.PAPER}`,
    boxShadow: t.isLight
      ? 'inset 0 1px 0 rgba(255,255,255,1), 0 1px 2px rgba(20,18,15,0.05), 0 14px 28px -20px rgba(20,18,15,0.38)'
      : 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 4px rgba(0,0,0,0.25), 0 16px 32px -20px rgba(0,0,0,0.9)',
  };
}

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────────

const validPhoto = (p) => (typeof p === 'string' && /^(https?:|data:image\/|\/|blob:)/.test(p.trim()) ? p.trim() : null);
const initialsOf = (c) => (String(c.i || '').trim() || String(c.n || '?').trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?');

// A client's face: their facet avatar (BSFacetAvatar, as on their profile: their photo, else their initials,
// in the gem of their colour), their standing as the gem's corner dot, and for today's a faint light
// breathing behind it. The gem is the client module's, read at call time; a plain round face stands in only
// where it is not loaded (a test's harness).
function PcFace({ t, c, sig, size = 36 }) {
  const FA = typeof window !== 'undefined' ? window.BSFacetAvatar : null;
  const photo = validPhoto(c.avatarUrl || c.avatar) || undefined;
  const dot = sig && sig.sev !== 'past' ? toneOf(t, sig.sev).hue : null;
  const halo = sig && sig.sev === 'red';
  return (
    <span aria-hidden="true" data-pc-face="" style={{ position: 'relative', flex: 'none', width: size, height: size, display: 'grid', placeItems: 'center' }}>
      {halo ? <span style={{ position: 'absolute', inset: -Math.round(size * 0.22), borderRadius: 999, background: `radial-gradient(closest-side, ${hexA(dot, t.isLight ? 0.22 : 0.3)}, transparent)`, animation: 'bspc-breathe 3.6s ease-in-out infinite', pointerEvents: 'none' }} /> : null}
      {FA ? <FA size={size} c={c.c || undefined} initial={c.i || undefined} name={c.n || ''} photo={photo} showRank={false} online={!!dot} dotC={dot || undefined} />
        : <PcRoundFace t={t} c={c} size={size} photo={photo} />}
    </span>
  );
}
function PcRoundFace({ t, c, size, photo }) {
  const [broken, setBroken] = useState(false);
  return (
    <span style={{ position: 'relative', width: size, height: size, borderRadius: 999, display: 'grid', placeItems: 'center', background: c.c || inkA(t, 0.45) }}>
      <span style={{ fontFamily: BS_CLEAN_HEAD, fontWeight: 700, fontSize: Math.round(size * 0.38), color: '#fff', lineHeight: 1 }}>{initialsOf(c)}</span>
      {photo && !broken ? <img src={photo} alt="" onError={() => setBroken(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 999, objectFit: 'cover' }} /> : null}
    </span>
  );
}

// The name, and their age when the roster holds it (a string: 0 is a real age).
function PcName({ t, c, model }) {
  const age = model.ageWord(c);
  return (
    <span style={{ display: 'block', fontFamily: BS_CLEAN_HEAD, fontSize: 15, fontWeight: 650, letterSpacing: '-0.015em', lineHeight: 1.25, color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {c.n}{age ? <span style={{ fontFamily: BS_CLEAN_SANS, fontSize: 12, fontWeight: 500, color: t.INK50 }}> · {age}</span> : null}
    </span>
  );
}

// The small line under a quiet row's name: the phase as plain text with the facts the roster holds
// (program, streak, workouts or intake, since when), then the row's marks (a weekend gap, a variable week,
// a payment retrying). Under a reason (`marksOnly`), the marks alone.
function PcSmall({ t, c, model, kit, tr, marksOnly = false }) {
  const phase = marksOnly ? null : (c.r || (model.pastMode ? tr('coach:roster.labelPast', { defaultValue: 'PAST' }) : null));
  const list = marksOnly ? [] : model.rowFacts(c);
  const marks = model.marks(c);
  const Pay = kit.PayRetry;
  const retry = c && c.paymentRetrying === true;
  if (!phase && !list.length && !marks.length && !retry) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, marginTop: 3 }}>
      {phase || list.length ? (
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: BS_CLEAN_SANS, fontSize: 12, fontWeight: 500, color: t.INK50 }}>
          {phase}{phase && list.length ? ' · ' : ''}{list.length ? <span data-roster-facts="">{list.join(' · ')}</span> : null}
        </span>
      ) : null}
      {marks.map((mk) => <span key={mk.k} style={{ flex: 'none', fontFamily: BS_CLEAN_SANS, fontSize: 11, fontWeight: 700, color: toneOf(t, mk.tone).text, whiteSpace: 'nowrap' }}>{mk.text}</span>)}
      {retry && Pay ? <span style={{ flex: 'none' }}><Pay c={c} /></span> : null}
    </span>
  );
}

const ChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9.5L4 20z" /></svg>
);
const SearchIcon = ({ color }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
);
const Chevron = ({ color, down = false }) => (
  <svg width={down ? 12 : 8} height={down ? 8 : 14} viewBox={down ? '0 0 12 8' : '0 0 8 14'} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d={down ? 'M1.5 1.5l4.5 4.5 4.5-4.5' : 'M1.5 1.5l5 5.5-5 5.5'} /></svg>
);

// The Message door, quiet: an outlined round icon in a 44px target ("Message Priya Singh" to a reader).
function PcMessage({ t, tr, c, model }) {
  return (
    <button type="button" data-pc-message="" data-pc-lift="" onClick={() => model.messageClient(c)} aria-label={tr('coach:roster.messageAria', { defaultValue: 'Message {name}', name: c.n })}
      style={{ flex: 'none', width: 44, height: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', color: t.INK }}>
      <span style={{ width: 38, height: 38, borderRadius: 99, display: 'grid', placeItems: 'center', boxSizing: 'border-box', border: `1px solid ${inkA(t, 0.14)}`, background: t.isLight ? 'rgba(255,255,255,0.9)' : inkA(t, 0.06), boxShadow: t.isLight ? '0 4px 10px -6px rgba(20,18,15,0.3)' : '0 4px 12px -6px rgba(0,0,0,0.8)' }}><ChatIcon /></span>
    </button>
  );
}

// ＋ Add, the page's one primary action: a lit pill in a 44px target, its words at AA on it.
function PcAdd({ t, tr, model }) {
  const f = t.isLight ? { bg: '#0a7a72', fg: '#ffffff' } : { bg: '#34d6c5', fg: '#06201d' };
  return (
    <button type="button" onClick={model.goGrowRoster} data-pc-lift="" aria-label={tr('coach:addClient.aria', { defaultValue: 'Add a client' })}
      style={{ flex: 'none', minWidth: 44, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 99, boxSizing: 'border-box', background: f.bg, color: f.fg, fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', boxShadow: t.isLight ? '0 8px 16px -10px rgba(10,122,114,0.7)' : '0 6px 18px -8px rgba(52,214,197,0.55)' }}>
        <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>＋</span>{tr('coach:head.add', { defaultValue: 'Add' })}
      </span>
    </button>
  );
}

// What the page lists for the view picked, as sections. The rules: a filtered-to-empty roster, Needs you
// grouped by how soon (today, this week, new), All as one list, On track eight at a time, Past, and a roster
// with nobody in it yet.
function pcSections(model, tr) {
  const out = { sections: [], noMatch: false, nobodyNeeds: false, everyoneElse: false, emptyRoster: false };
  const { activeView, rows, pastMode, totalCount, status } = model;
  out.noMatch = !pastMode && rows.length === 0 && totalCount > 0;
  if (activeView === 'needs' && rows.length > 0) {
    model.groups.forEach(({ sev, label }) => {
      const items = model.needsRows.filter((r) => r.sig.sev === sev);
      if (items.length) out.sections.push({ key: sev, sev, label, count: items.length, items, lead: true });
    });
    out.nobodyNeeds = model.k === 0;
    out.everyoneElse = model.m > 0;
  }
  if (activeView === 'all' && rows.length > 0) {
    out.sections.push({ key: 'all', sev: null, label: tr('coach:roster.groupAll', { defaultValue: 'Current clients' }), count: model.allRows.length, items: model.allRows, lead: true });
  }
  if (activeView === 'track' && rows.length > 0) {
    out.sections.push({ key: 'track', sev: 'green', label: tr('coach:roster.tabTrack', { defaultValue: 'On track' }), count: model.onTrackRows.length, items: model.trackShown, lead: false,
      empty: model.onTrackRows.length ? null : tr('coach:roster.noneOnTrack', { defaultValue: 'Nobody is on track yet. Start with Needs you.' }),
      more: model.trackMore > 0 ? model.trackMore : 0 });
  }
  if (pastMode && status === 'ready') {
    out.sections.push({ key: 'past', sev: 'past', label: tr('coach:roster.tabPast', { defaultValue: 'Past' }), count: model.pastRows.length, items: model.pastRows, lead: false,
      empty: model.pastRows.length ? null : tr('coach:roster.noPast', { defaultValue: 'NO PAST CLIENTS' }) });
  }
  out.emptyRoster = status === 'ready' && totalCount === 0;
  return out;
}

// The roster's state while it is not ready: loading, or could not load with Retry.
function PcStatus({ t, tr, model }) {
  if (model.status === 'ready') return null;
  return (
    <div role="status" data-pc-status={model.status} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 13, lineHeight: 1.4, color: t.INK70 }}>
      <span style={{ flex: '1 1 160px', minWidth: 0 }}>{model.status === 'loading' ? tr('coach:roster.loading', { defaultValue: 'Loading clients…' }) : tr('coach:roster.unavailable', { defaultValue: 'Could not load your clients. Check your connection and retry.' })}</span>
      {model.status === 'error' ? (
        <button type="button" onClick={model.onRetry} style={{ flex: 'none', minWidth: 72, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${inkA(t, 0.18)}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 650 }}>{tr('coach:roster.retry', { defaultValue: 'Retry' })}</button>
      ) : null}
    </div>
  );
}

// The four views, with their counts (a count is left off where it would mislead: in Past, the current
// roster's counts are not on screen), as words with a thin ink bar sliding under the picked one.
function PcTabs({ t, tr, model, style = null }) {
  const red = toneOf(t, 'red');
  const p = model.pastMode;
  const tabs = [
    { key: 'needs', label: tr('coach:roster.tabNeeds', { defaultValue: 'Needs you' }), count: p ? null : model.k, onPick: model.pickTab.needs },
    { key: 'track', label: tr('coach:roster.tabTrack', { defaultValue: 'On track' }), count: p ? null : model.m, onPick: model.pickTab.track },
    { key: 'past', label: tr('coach:roster.tabPast', { defaultValue: 'Past' }), count: model.pastCount, onPick: model.pickTab.past },
    { key: 'all', label: tr('coach:roster.tabAll', { defaultValue: 'All' }), count: p ? null : model.allRows.length, onPick: model.pickTab.all },
  ];
  return (
    <div role="tablist" aria-label={tr('coach:roster.viewAria', { defaultValue: 'Roster view' })} data-roster-view={model.activeView}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, auto))', justifyContent: 'start', columnGap: 4, borderBottom: `1px solid ${inkA(t, 0.1)}`, ...(style || {}) }}>
      {tabs.map((tb) => {
        const on = model.activeView === tb.key;
        return (
          <button key={tb.key} type="button" role="tab" aria-selected={on} onClick={tb.onPick}
            style={{ position: 'relative', minWidth: 44, minHeight: 46, padding: '0 8px', border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: on ? 650 : 500, letterSpacing: '-0.01em', color: on ? t.INK : t.INK70, whiteSpace: 'nowrap' }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tb.label}</span>
            {tb.count != null ? <span style={{ fontSize: 12.5, fontWeight: 650, color: tb.key === 'needs' && tb.count > 0 ? red.text : t.INK50, fontVariantNumeric: 'tabular-nums' }}>{tb.count}</span> : null}
            <span aria-hidden="true" style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 2.5, borderRadius: '3px 3px 0 0', background: t.INK, transform: on ? 'scaleX(1)' : 'scaleX(0)', transition: 'transform 240ms cubic-bezier(.2,.8,.2,1)' }} />
          </button>
        );
      })}
    </div>
  );
}

// The search and the phase filter in one row: a rounded field, and the phase as one small picker beside it
// (ALL · CUT · BUILD · PEAK), lit in the role's colour when it narrows the list. Clear filters under it when
// anything does. Both are set at 16px: iOS zooms the page into a smaller field on focus.
function PcFind({ t, tr, model, style = null }) {
  const field = { boxSizing: 'border-box', minHeight: 46, borderRadius: 99, background: t.isLight ? 'rgba(255,255,255,0.8)' : inkA(t, 0.055), border: `1px solid ${inkA(t, t.isLight ? 0.1 : 0.12)}`, boxShadow: t.isLight ? 'inset 0 1px 2px rgba(20,18,15,0.05)' : 'inset 0 1px 3px rgba(0,0,0,0.4)' };
  const narrowed = model.filter !== 'all';
  return (
    <div style={style || undefined}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
        <label data-pc-search="" style={{ ...field, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', cursor: 'text' }}>
          <SearchIcon color={t.INK50} />
          <input value={model.query} onChange={(e) => model.setQuery(e.target.value)} aria-label={tr('coach:roster.searchAria', { defaultValue: 'Search clients' })}
            placeholder={tr('coach:roster.searchPlaceholder', { defaultValue: 'Search {count} clients', count: model.totalCount })}
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: BS_CLEAN_SANS, fontSize: 16, fontWeight: 500 }} />
        </label>
        <span data-pc-phase={model.filter} style={{ ...field, position: 'relative', flex: 'none', display: 'inline-flex', alignItems: 'center',
          ...(narrowed ? { border: `1px solid ${hexA(model.heat, 0.7)}`, background: hexA(model.heat, t.isLight ? 0.1 : 0.16) } : null) }}>
          <select value={model.filter} onChange={(e) => model.setFilter(e.target.value)} aria-label={tr('coach:roster.phaseAria', { defaultValue: 'Filter by phase' })}
            style={{ appearance: 'none', WebkitAppearance: 'none', minHeight: 44, minWidth: 44, height: '100%', padding: '0 32px 0 16px', border: 0, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 16, fontWeight: 650, letterSpacing: '0.02em', outline: 'none' }}>
            {model.filters.map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 13, top: '50%', marginTop: -4, pointerEvents: 'none', display: 'flex' }}><Chevron color={t.INK70} down /></span>
        </span>
      </div>
      {model.filtered ? (
        <button type="button" onClick={model.clearFilters} style={{ minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 650, color: tealText(t) }}>{tr('coach:roster.clearFilters', { defaultValue: 'Clear filters' })}</button>
      ) : null}
    </div>
  );
}

// The words under the list: nothing matched, nobody needs you, everyone else is on track, no clients yet.
function PcNotes({ t, tr, model, plan }) {
  const quiet = (label) => <p style={{ margin: '20px 0 0', padding: '18px 16px', borderRadius: 16, textAlign: 'center', background: inkA(t, t.isLight ? 0.04 : 0.05), fontFamily: BS_CLEAN_SANS, fontSize: 12, fontWeight: 650, letterSpacing: '0.06em', color: t.INK70 }}>{label}</p>;
  return (
    <>
      {plan.noMatch ? quiet(tr('coach:roster.noMatching', { defaultValue: 'NO MATCHING CLIENTS' })) : null}
      {plan.nobodyNeeds && !plan.noMatch ? <p style={{ margin: '20px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, color: t.INK70 }}>{tr('coach:roster.nobodyNeeds', { defaultValue: 'Nobody needs you right now.' })}</p> : null}
      {plan.everyoneElse ? (
        <button type="button" onClick={model.pickTab.track} style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px', minHeight: 48, padding: 0, background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontFamily: BS_CLEAN_SANS, fontSize: 13.5, color: t.INK70 }}>{tr('coach:roster.everyoneElse', { defaultValue: 'Everyone else is on track.' })}</span>
          <span style={{ fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 650, color: tealText(t) }}>{tr('coach:roster.seeCount', { defaultValue: 'See {count} →', count: model.m })}</span>
        </button>
      ) : null}
      {plan.emptyRoster ? (
        <div style={{ marginTop: 20 }}>
          {quiet(tr('coach:roster.noClients', { defaultValue: 'NO CLIENTS YET' }))}
          <button type="button" onClick={model.goGrowRoster} style={{ display: 'block', margin: '10px auto 0', minHeight: 44, padding: '0 8px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 650, color: tealText(t) }}>{tr('coach:roster.growRoster', { defaultValue: 'Grow your roster →' })}</button>
        </div>
      ) : null}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The page. `t` is the clean theme the roster view set its words in.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function BSProClients({ t, model, kit }) {
  const tr = useShapeTr();
  const { BSPage, BSFooter } = window;
  const AddSheet = kit.AddSheet;
  const plan = pcSections(model, tr);
  const { ready, need, avg, active } = model.deck;
  const pool = (model.needPool || []).slice(0, 5);
  const live = ready && need > 0;
  const words = !ready ? '—' : need > 0 ? tr('coach:roster.clientsNeedYou', { defaultValue: '{count, plural, one {# client needs you} other {# clients need you}}', count: need }) : tr('coach:roster.nobodyNeeds', { defaultValue: 'Nobody needs you right now.' });
  const figures = [
    { k: 'avg', v: ready && avg != null ? `${avg}%` : '—', l: model.role === 'nutritionist' ? tr('coach:roster.kpiAvgLogged', { defaultValue: 'Avg logged · 7d' }) : tr('coach:roster.kpiAvgAdherence', { defaultValue: 'Avg adherence' }) },
    { k: 'active', v: ready ? String(active) : '—', l: tr('coach:ticker.active', { defaultValue: 'ACTIVE' }) },
  ];

  // A row: the face, the name and the reason (a client who needs the coach) or the phase and facts (anyone
  // else: "On plan — nothing needed" would say less than their program and streak), the week's figure, and
  // Message. The rest of the row opens the client's file.
  const row = (r, i, section) => {
    const { c, sig } = r;
    const pct = model.rowAdh(c);
    const reason = ['red', 'amber', 'new'].includes(sig.sev) ? sig.directive : null;
    return (
      <div key={`${section.key}-${c.n}-${i}`} data-roster-sev={sig.sev} style={{ display: 'flex', alignItems: 'center', gap: 2, animation: `bspc-in 360ms ease-out ${stagger(i, 30)} both` }}>
        <button type="button" onClick={() => model.onOpen(c)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '8px 4px 8px 16px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK }}>
          <PcFace t={t} c={c} sig={sig} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <PcName t={t} c={c} model={model} />
            {reason ? (
              <>
                <span data-pc-reason="" style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: t.INK70 }}>{reason}</span>
                <PcSmall t={t} c={c} model={model} kit={kit} tr={tr} marksOnly />
              </>
            ) : <PcSmall t={t} c={c} model={model} kit={kit} tr={tr} />}
          </span>
          {pct != null ? <span data-roster-week="" style={{ position: 'relative', flex: 'none', minWidth: 40, textAlign: 'right', fontFamily: BS_CLEAN_HEAD, fontSize: 14, fontWeight: 650, color: figTone(t, pct).text, fontVariantNumeric: 'tabular-nums' }}>{pct}%<span style={srOnly}> {model.weekLabel(c)}</span></span> : null}
        </button>
        <span style={{ flex: 'none', paddingRight: 6 }}><PcMessage t={t} tr={tr} c={c} model={model} /></span>
      </div>
    );
  };

  const summaryInner = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36 }}>
        {pool.map((r, i) => <span key={`${r.c.n}-${i}`} style={{ animation: `bspc-in 380ms ease-out ${stagger(i, 60)} both` }}><PcFace t={t} c={r.c} sig={r.sig} size={34} /></span>)}
        <span style={{ flex: 1 }} />
        {live ? <Chevron color={inkA(t, 0.45)} /> : null}
      </span>
      <span data-pc-summary-words="" style={{ display: 'block', marginTop: pool.length ? 14 : 4, fontFamily: BS_CLEAN_HEAD, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, color: t.INK, textAlign: 'left' }}>{words}</span>
      <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${inkA(t, 0.08)}`, fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 500, color: t.INK70, textAlign: 'left' }}>
        {figures.map((f) => (
          <span key={f.k} data-pc-figure={f.k}><b style={{ fontFamily: BS_CLEAN_HEAD, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{f.v}</b> <span style={{ textTransform: 'lowercase' }}>{f.l}</span></span>
        ))}
      </span>
    </>
  );
  const summaryStyle = { ...pcCard(t), display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 18, padding: '16px 18px 14px', textAlign: 'left', color: t.INK, animation: 'bspc-in 420ms ease-out both' };
  const withItems = plan.sections.filter((s) => s.items.length);

  const body = (
    <>
      <style>{PC_CSS}</style>
      <div style={{ padding: `${MAST_TOP()} ${t.padX}px 0` }}>{kit.mastRow ? kit.mastRow() : null}</div>
      <BSCleanType t={t}>
        <div data-pro-clients="" style={{ padding: `0 ${t.padX}px 32px` }}>
          {/* The title (the onboarding tour points at it, hero-clients) with the role's full stop, and ＋ Add. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
            <h1 data-tour="hero-clients" style={{ margin: 0, minWidth: 0, fontFamily: BS_CLEAN_HEAD, fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.02, color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tr('coach:nav.clients', { defaultValue: 'Clients' })}<span aria-hidden="true" style={{ color: model.heat }}>.</span>
            </h1>
            <PcAdd t={t} tr={tr} model={model} />
          </div>

          {/* Who needs you, first: their faces, how many (the NEED YOU figure, as a sentence), and the other two
              figures under a hairline. It opens Needs you when anyone does. */}
          {live
            ? <button type="button" data-pc-summary="" data-pc-figure="need" data-pc-lift="" onClick={model.pickTab.needs} style={{ ...summaryStyle, cursor: 'pointer' }}>{summaryInner}</button>
            : <div data-pc-summary="" data-pc-figure="need" style={summaryStyle}>{summaryInner}</div>}
          <PcStatus t={t} tr={tr} model={model} />
          <PcTabs t={t} tr={tr} model={model} style={{ marginTop: 16 }} />
          <PcFind t={t} tr={tr} model={model} style={{ marginTop: 14 }} />

          {/* Everyone in one card: each group a small head inside it, then its rows. */}
          {withItems.length ? (
            <div data-pc-list="" style={{ ...pcCard(t), marginTop: 18, paddingBottom: 6 }}>
              {withItems.map((s, n) => {
                const tone = s.sev && s.sev !== 'past' ? toneOf(t, s.sev) : null;
                return (
                  <section key={s.key} data-roster-group={s.key} style={{ borderTop: n ? `1px solid ${inkA(t, 0.07)}` : 0 }}>
                    <h2 style={{ margin: 0, padding: '14px 16px 4px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: BS_CLEAN_SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK50 }}>
                      {tone ? <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: 99, background: tone.hue }} /> : null}
                      <span style={{ minWidth: 0 }}>{s.label}</span>
                      {s.count ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.count}</span> : null}
                    </h2>
                    {s.items.map((r, i) => row(r, i, s))}
                  </section>
                );
              })}
            </div>
          ) : null}
          {/* An empty view's line, and "8 more on track · Show ›" under a list cut at eight. */}
          {plan.sections.map((s) => ((s.empty || s.more) ? (
            <div key={`${s.key}-after`} data-roster-group={s.items.length ? undefined : s.key} style={{ marginTop: 14 }}>
              {s.empty ? <p style={{ margin: 0, padding: '16px', borderRadius: 16, background: inkA(t, t.isLight ? 0.04 : 0.05), textAlign: 'center', fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 600, color: t.INK70 }}>{s.empty}</p> : null}
              {s.more ? (
                <button type="button" onClick={model.expandTrack} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 44, borderRadius: 999, border: `1px solid ${inkA(t, 0.12)}`, background: 'transparent', cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 650, letterSpacing: '0.03em', color: t.INK70 }}>
                  {tr('coach:roster.moreOnTrack', { defaultValue: '{count} MORE ON TRACK', count: s.more })}<span style={{ color: t.INK }}>{tr('coach:roster.show', { defaultValue: 'SHOW ›' })}</span>
                </button>
              ) : null}
            </div>
          ) : null))}
          <PcNotes t={t} tr={tr} model={model} plan={plan} />
        </div>
      </BSCleanType>
      {BSFooter ? <BSFooter left={model.footerLeft} right={model.footerRight} /> : null}
      {model.showAdd && AddSheet ? <AddSheet role={model.role} onClose={model.closeAdd} /> : null}
    </>
  );
  return BSPage ? <BSPage>{body}</BSPage> : body;
}
