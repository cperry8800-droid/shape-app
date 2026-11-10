import React from 'react';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS } from './bsCleanType.jsx';
// ─── PROGRAMS / PLANS · THE LIBRARY ──────────────────────────────────────────────────────────────
// The coach's catalogue page (the trainer's Programs, the nutritionist's Plans), drawn as the Clients page
// is (BSProClients.jsx), so the coach app's two lists read as one (owner, 2026-11-09: "the layout/design and
// look for clients and programs page on app for coaches needs to be reviewed and changed"; before it, "keep
// designs simple … modern, appealing, easy to navigate, not overwhelming", "reduce the coloring and simplify
// UI more"). Top to bottom:
//   · the title with its role's full stop, what is published, and ＋ From scratch, the page's one filled
//     action;
//   · the kinds as words with a thin bar under the picked one;
//   · the search and the sort as one slim field;
//   · every plan as a row on the page itself: its photo, its name, its price with its length and facts, and
//     a quiet Assign. The most popular plan is the first row, marked ★, not a card of its own.
// ⚠ NOTHING IS SAID TWICE. The page used to give the most popular plan a card above the list and repeat
// every plan under Enrolled with the count its row already carried, which put the first plan 73% of the way
// down a phone (off the first screen at 320px).
// ⚠ THE PAGE HANDS IN WHAT IT SHOWS AND THE DOORS IT HAS (`model`, built by BSTrainerPrograms and
// BSNutriPlans): the tabs, the search, the sort, the counts, every list with its rows, its empty and
// search-miss lines, the featured plan, the sample's top pick, Enrolled, the clips, Music and the clip sheet.
// Nothing here reads or writes a plan; a figure the row does not carry is not drawn.
// ⚠ EVERY TAP IS 44px: a compact pill draws 34px inside a 44px button.
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP, and this module never imports the pros or
// client module (the BSLeaderboard / BSEatDay pattern).

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

// ── Colour, surfaces and type ────────────────────────────────────────────────────────────────────
const HEAD = BS_CLEAN_HEAD;
const SANS = BS_CLEAN_SANS;
const inkA = (t, a) => `rgba(${t.inkRGB || (t.isLight ? '15,14,12' : '245,240,230')},${a})`;
const tealOf = (t) => (t.isLight ? '#0a8f87' : '#34d6c5');
const tealInk = (t) => (t.isLight ? '#07706a' : '#34d6c5');
// The role's colour (trainer rust, nutritionist gold): the title's full stop, the picked icon, the ★.
const heatOf = (t, role) => (role === 'nutritionist' ? (t.isLight ? '#a07a2e' : '#d8b25a') : '#c0533b');

// A quiet tile in the paper's own colour (the sample's top pick, a note, an alert).
const pcTile = (t, r = 20) => ({
  position: 'relative', boxSizing: 'border-box', borderRadius: r,
  background: t.isLight ? `linear-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0.7)), ${t.PAPER}` : `linear-gradient(${inkA(t, 0.06)}, ${inkA(t, 0.06)}), ${t.PAPER}`,
  border: `1px solid ${inkA(t, t.isLight ? 0.07 : 0.1)}`,
  boxShadow: t.isLight
    ? `0 1px 2px ${inkA(t, 0.06)}, 0 14px 28px -18px ${inkA(t, 0.38)}`
    : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 32px -20px rgba(0,0,0,0.95)',
});
// A soft pill: the profile's chips and quiet buttons, 44px.
const pcPill = (t) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '0 16px', boxSizing: 'border-box',
  borderRadius: 999, border: `1px solid ${inkA(t, t.isLight ? 0.1 : 0.14)}`, background: t.isLight ? 'rgba(255,255,255,0.72)' : inkA(t, 0.06),
  color: t.INK, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
});
// The empty list's Build from scratch: teal, filled.
const pcPrimary = (t) => ({ ...pcPill(t), border: 0, background: tealOf(t), color: t.isLight ? '#ffffff' : '#04201d', fontWeight: 700 });
const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' };
const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const onTop = { position: 'relative', zIndex: 2 };

// The motion, in one sheet: rows rise in and sink under a finger, the picked tab's bar slides. Under reduced motion none of it runs, and every resting style is the finished one.
const PC_CSS = `
@keyframes bspc-in { from { opacity: 0; transform: translateY(12px); } }
@keyframes bspc-shimmer { from { background-position: -320px 0; } to { background-position: 320px 0; } }
[data-pro-catalog] button { -webkit-tap-highlight-color: transparent; }
[data-pro-catalog] button:focus-visible, [data-pro-catalog] input:focus-visible, [data-pro-catalog] select:focus-visible { outline: 2px solid var(--pc-teal); outline-offset: 2px; }
[data-pro-catalog] [data-pc-open]:focus-visible { outline-offset: -3px; }
[data-pc-in] { animation: bspc-in 440ms cubic-bezier(.2,.8,.2,1) both; }
[data-pc-lift] { transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
[data-pc-lift]:active { transform: scale(0.982); }
[data-pc-press] { transition: transform 160ms ease; }
[data-pc-press]:active { transform: scale(0.96); }
[data-pc-tab-bar] { transition: transform 240ms cubic-bezier(.2,.8,.2,1); }
[data-pc-skel] { background-size: 640px 100% !important; animation: bspc-shimmer 1.4s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  [data-pro-catalog] *, [data-pro-catalog] *::before, [data-pro-catalog] *::after { animation: none !important; transition: none !important; }
  [data-pc-lift]:active, [data-pc-press]:active { transform: none !important; }
}
`;

// ── What a row's line says ───────────────────────────────────────────────────────────────────────
// The length, who is on it and the rating, read off the row's own line; the rest of the line as it is. A
// figure the line does not carry is not shown.
export function bsProCatalogFacts(meta, tr) {
  const m = String(meta || '');
  const parts = m.split('·').map((s) => s.trim()).filter(Boolean);
  const reWk = /(\d+)\s*(?:wk|wks|week|weeks)\b/i;
  const reDays = /(\d+)\s*days?\s*\/\s*wk/i;
  const reMin = /(\d+)\s*min\b/i;
  let len = null;
  let lenRe = null;
  if (reDays.test(m)) { len = { n: m.match(reDays)[1], unit: tr('coach:plans.unitDaysWk', { defaultValue: 'D/WK' }) }; lenRe = reDays; }
  else if (reWk.test(m)) { len = { n: m.match(reWk)[1], unit: tr('coach:plans.unitWk', { defaultValue: 'WK' }) }; lenRe = reWk; }
  else if (reMin.test(m)) { len = { n: m.match(reMin)[1], unit: tr('coach:plans.unitMin', { defaultValue: 'MIN' }) }; lenRe = reMin; }
  const clientsN = Number((m.match(/(\d+)\s*on it/i) || m.match(/used by\s*(\d+)/i) || [])[1]) || 0;
  const rating = (m.match(/([\d.]+)\s*★/) || [])[1] || null;
  const isStat = (s) => /\d+\s*on it/i.test(s) || /used by\s*\d+/i.test(s) || /★/.test(s);
  const lenPart = lenRe ? parts.find((s) => lenRe.test(s)) : null;
  const rest = parts.filter((s) => !isStat(s) && s !== lenPart).join(' · ');
  const clients = clientsN > 0 ? tr('coach:plans.clientsCount', { defaultValue: '{count, plural, one {# client} other {# clients}}', count: clientsN }) : null;
  // A fact breaks only between facts ("4.9" kept with its ★).
  const stats = [clients, rating ? `${rating} ★` : null].filter(Boolean).map((f) => f.replace(/ /g, ' '));
  const lenText = len ? `${len.n} ${len.unit}` : null;
  // The plan's own facts (kcal, RPE, diet) stay beside its stats (Codex P2 on #2612).
  return { len, line: [lenText, rest, stats.length ? stats.join(' · ') : null].filter(Boolean).join(' · ') };
}
// A line's rating keeps its ★ ("4.9 ★" never splits).
const keepStar = (x) => String(x || '').replace(/ ★/g, ' ★');

// ── Photos ───────────────────────────────────────────────────────────────────────────────────────
// A plan's photo: the one the coach added to it, or the sample's in the signed-out preview; with neither, a
// plain block in the paper's own tone carrying the plan's length (or its initial).
const PC_DEMO_PHOTOS = {
  trainer: ['studio-02', 'studio-01', 'plan-01', 'studio-03', 'wall-01', 'box-cover', 'wall-02', 'wall-03'],
  nutritionist: ['meal-03', 'meal-01', 'meal-02', 'kitchen-01'],
};
const pcHash = (s) => { let h = 0; const x = String(s || ''); for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0; return h; };
function pcBase() {
  try { return (import.meta.env && import.meta.env.BASE_URL) || '/'; } catch (e) { return '/'; }
}
const pcSafeUrl = (u) => (typeof u === 'string' && /^(https?:\/\/|\/)/i.test(u.trim()) ? u.trim() : null);
function pcOwnPhoto(item) {
  const media = item && item.detail && Array.isArray(item.detail.media) ? item.detail.media : [];
  const img = media.find((x) => x && x.type === 'image' && pcSafeUrl(x.url));
  return img ? pcSafeUrl(img.url) : null;
}
// The sample's photos, handed out once each per screen (by the name's hash, then the next free one).
export function bsProCatalogPhotos(role) {
  const pool = PC_DEMO_PHOTOS[role] || PC_DEMO_PHOTOS.trainer;
  const used = new Map();
  return (item) => {
    const own = pcOwnPhoto(item);
    if (own) return own;
    if (!item || !item.demo) return null;
    const key = item.key || item.name;
    if (used.has(key)) return used.get(key);
    const taken = new Set(used.values());
    const start = pcHash(item.name) % pool.length;
    let pick = null;
    for (let k = 0; k < pool.length; k++) { const s = `${pcBase()}demo/${pool[(start + k) % pool.length]}.webp`; if (!taken.has(s)) { pick = s; break; } }
    const src = pick || `${pcBase()}demo/${pool[start]}.webp`;
    used.set(key, src);
    return src;
  };
}
function PcThumb({ t, item, src, size = 60, r = 16 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const photo = src && !broken ? src : null;
  const len = item.facts.len;
  return (
    <span aria-hidden="true" data-pc-thumb={photo ? 'photo' : 'plain'} style={{ position: 'relative', width: size, height: size, flexShrink: 0, borderRadius: r, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1, color: t.INK, background: photo ? '#1a1815' : inkA(t, t.isLight ? 0.06 : 0.08) }}>
      {photo ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : len ? <><span style={{ fontFamily: HEAD, fontSize: Math.round(size * 0.36), fontWeight: 700, letterSpacing: '-0.03em' }}>{len.n}</span><span style={{ marginTop: 2, fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: t.INK70 }}>{len.unit}</span></>
        : <span style={{ fontFamily: HEAD, fontSize: Math.round(size * 0.4), fontWeight: 700 }}>{String(item.name || '·').trim().charAt(0).toUpperCase()}</span>}
    </span>
  );
}

// ── Doors and pills ──────────────────────────────────────────────────────────────────────────────
// The plan's door: a clear button over the whole tile, so the tile opens it and the controls on top keep
// their own taps (they sit above it, z-index 2).
function PcOpen({ label, onOpen }) {
  if (!onOpen) return null;
  return <button type="button" data-pc-open="" aria-label={label} onClick={onOpen} style={{ position: 'absolute', inset: 0, zIndex: 1, width: '100%', height: '100%', margin: 0, padding: 0, border: 0, borderRadius: 'inherit', background: 'transparent', cursor: 'pointer' }} />;
}
// A compact pill (owner, 2026-11-04: "just reduce size of this button"): 34px drawn inside a 44px button
// (30px on a row, `small`).
// `kind` 'primary' is the page's one filled teal action (the most popular plan's Assign, the sample's Edit);
// 'quiet' the soft pill every other plan's Assign wears; 'bare' the words alone (Copy, Duplicate, Share).
function PcCompact({ t, label, aria, onClick, kind = 'quiet', tag, small = false }) {
  const look = kind === 'primary'
    ? { background: tealOf(t), color: t.isLight ? '#ffffff' : '#04201d', border: 0 }
    : kind === 'quiet'
      ? { background: t.isLight ? 'rgba(255,255,255,0.72)' : inkA(t, 0.06), color: t.INK, border: `1px solid ${inkA(t, t.isLight ? 0.12 : 0.16)}` }
      : { background: 'transparent', color: t.INK70, border: 0 };
  return (
    <button type="button" data-pc-press="" data-pc-compact={kind} data-pc-action={tag} onClick={onClick} aria-label={aria}
      style={{ ...onTop, flexShrink: 0, minWidth: 44, minHeight: 44, margin: '-5px 0', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <span data-pc-pill="" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: small ? 30 : 34, padding: kind === 'bare' ? '0 6px' : small ? '0 12px' : '0 14px', boxSizing: 'border-box', borderRadius: 999, fontFamily: SANS, fontSize: 13, fontWeight: kind === 'bare' ? 600 : 700, whiteSpace: 'nowrap', ...look }}>{label}</span>
    </button>
  );
}

// ── The page's parts ─────────────────────────────────────────────────────────────────────────────
// The kinds as words, with a thin ink bar under the picked one (the Clients page's views).
function PcTabs({ t, m }) {
  return (
    <div role="tablist" aria-label={m.tabsAria} style={{ display: 'flex', flexWrap: 'wrap', columnGap: 4, marginTop: 8, boxShadow: `inset 0 -1px 0 ${inkA(t, 0.1)}` }}>
      {m.tabs.map(([k, label], i) => {
        const on = m.tab === k;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} data-pc-tab={k} onClick={() => m.onTab(k)}
            style={{ position: 'relative', minWidth: 44, minHeight: 44, padding: '0 8px', marginLeft: i ? 0 : -8, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SANS, fontSize: 13.5, fontWeight: on ? 650 : 500, letterSpacing: '-0.01em', color: on ? t.INK : t.INK70, whiteSpace: 'nowrap' }}>
            {label}
            <span aria-hidden="true" data-pc-tab-bar="" style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 2.5, borderRadius: '3px 3px 0 0', background: t.INK, transform: on ? 'scaleX(1)' : 'scaleX(0)' }} />
          </button>
        );
      })}
    </div>
  );
}
// The search and the sort as one slim field: the search, a hairline, then the sort as a small picker under
// a sort mark (Popular · Price · Rating), on the lists that sort. Set at 16px: iOS zooms into a smaller field.
function PcFind({ t, m }) {
  if (!m.search) return null;
  const s = m.search;
  const sort = m.sort;
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', boxSizing: 'border-box', minHeight: 44, marginTop: 12, borderRadius: 14, background: inkA(t, t.isLight ? 0.045 : 0.07) }}>
      <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '0 6px 0 13px', cursor: 'text' }}>
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={t.INK50} strokeWidth="2.2" strokeLinecap="round" style={{ flex: 'none' }}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input type="search" value={s.value} onChange={(e) => s.onChange(e.target.value)} aria-label={s.aria} placeholder={s.placeholder}
          style={{ flex: 1, minWidth: 0, width: '100%', minHeight: 44, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: SANS, fontSize: 16, fontWeight: 500, textOverflow: 'ellipsis' }} />
      </label>
      {sort ? (
        <>
          <span aria-hidden="true" style={{ flex: 'none', width: 1, margin: '10px 0', background: inkA(t, 0.12) }} />
          <span data-pc-sort={sort.value} style={{ position: 'relative', flex: 'none', display: 'inline-flex', alignItems: 'center' }}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.INK70} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', marginTop: -7.5, pointerEvents: 'none' }}><path d="M7 5v14M7 19l-3-3M7 19l3-3M17 19V5M17 5l-3 3M17 5l3 3" /></svg>
            <select value={sort.value} onChange={(e) => sort.onPick(e.target.value)} aria-label={sort.label}
              style={{ appearance: 'none', WebkitAppearance: 'none', minHeight: 44, minWidth: 44, height: '100%', padding: '0 28px 0 34px', border: 0, background: 'transparent', color: t.INK70, cursor: 'pointer', fontFamily: SANS, fontSize: 16, fontWeight: 600, outline: 'none' }}>
              {sort.options.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <svg aria-hidden="true" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke={t.INK50} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 11, top: '50%', marginTop: -4, pointerEvents: 'none' }}><path d="M1.5 1.5l4.5 4.5 4.5-4.5" /></svg>
          </span>
        </>
      ) : null}
    </div>
  );
}
// A list's small head, and the way to make one of its kind (＋ New) where the list has it.
function PcHead({ t, title, trail = null, first = false }) {
  return (
    <div style={{ marginTop: first ? 6 : 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: trail ? 44 : 36 }}>
      <h2 style={{ margin: 0, minWidth: 0, fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.INK50, overflowWrap: 'anywhere' }}>{title}</h2>
      {trail ? (
        <button type="button" data-pc-press="" data-pc-trail="" onClick={trail.onClick} style={{ flexShrink: 0, minWidth: 44, minHeight: 44, marginRight: -6, padding: '0 6px', border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: SANS, fontSize: 13, fontWeight: 650, color: tealInk(t), whiteSpace: 'nowrap' }}>
          {trail.icon ? <span aria-hidden="true">{trail.icon}</span> : null}{trail.label}
        </button>
      ) : null}
    </div>
  );
}
// An empty list: what is missing, then the way to make one (From scratch, Ask Nora) where the page has it.
function PcEmpty({ t, empty }) {
  if (!empty) return null;
  return (
    <div data-pc-empty="" style={{ boxSizing: 'border-box', borderRadius: 14, background: inkA(t, t.isLight ? 0.04 : 0.05), marginTop: 4, padding: '16px 16px 10px', textAlign: 'center' }}>
      <div style={{ paddingBottom: 6, fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK70 }}>{empty.label}</div>
      {empty.build ? <button type="button" data-pc-press="" onClick={empty.build.onClick} style={{ ...pcPrimary(t), marginTop: 6 }}>{empty.build.label}</button> : null}
      {empty.nora ? <div style={{ marginTop: 4, display: 'flex', justifyContent: 'center' }}>{empty.nora}</div> : null}
    </div>
  );
}
// Loading: plain shapes that shimmer, never sample figures.
function PcSkeleton({ t, m }) {
  if (!m.loading) return null;
  const sheen = { background: `linear-gradient(90deg, ${inkA(t, 0.05)} 0%, ${inkA(t, 0.1)} 50%, ${inkA(t, 0.05)} 100%)` };
  return (
    <div role="status" data-pc-loading="" aria-label={m.loading} style={{ marginTop: 16 }}>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: t.INK70, marginBottom: 10 }}>{m.loading}</div>
      <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2].map((i) => <span key={i} data-pc-skel="" style={{ display: 'block', height: 62, borderRadius: 14, ...sheen }} />)}</div>
    </div>
  );
}
// The signed-out sample's top pick of a list, with EDIT · DUPLICATE · SHARE under it: the one tile left on
// the page, since it stands for a plan the sample does not list.
function PcLead({ t, role, item, src, lead }) {
  const line = keepStar(lead.meta);
  return (
    <div data-pc-featured="" data-pc-in="" style={{ ...pcTile(t, 16), marginTop: 14, padding: '10px 12px 4px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <PcThumb t={t} item={item} src={src} size={56} r={12} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: t.INK70, ...oneLine }}><span aria-hidden="true" style={{ color: heatOf(t, role) }}>★ </span>{lead.badge}</span>
          <div data-pc-featured-name="" style={{ marginTop: 2, fontFamily: HEAD, fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: t.INK, ...clamp2 }}>{lead.title}</div>
          {line ? <div style={{ marginTop: 2, fontFamily: SANS, fontSize: 12.5, lineHeight: 1.35, color: t.INK70, ...clamp2 }}>{line}</div> : null}
        </div>
      </div>
      <div style={{ ...onTop, marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 6px' }}>
        {lead.actions.map((x, i) => <PcCompact key={x.key} t={t} label={x.label} onClick={x.onClick} kind={i === 0 ? 'primary' : 'bare'} tag={x.key} />)}
      </div>
    </div>
  );
}
const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 5.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" /></svg>
);
// A plan as a row on the page: its photo, its name (the most popular one marked ★ over it), its price with
// its length and facts, a quiet Copy and a quiet Assign. The row opens the plan.
function PcRow({ t, tr, role, item, src, i }) {
  return (
    <div data-pc-item="" data-pc-in="" data-pc-lift="" data-pc-featured={item.badge ? '' : undefined} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '8px 0', borderTop: i ? `1px solid ${inkA(t, 0.07)}` : 0, animationDelay: `${Math.min(i, 8) * 40}ms` }}>
      <PcOpen label={tr('coach:plans.openAria', { defaultValue: 'Open {name}', name: item.name })} onOpen={item.onOpen} />
      <PcThumb t={t} item={item} src={src} size={48} r={12} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {item.badge ? <div data-pc-badge="" style={{ marginBottom: 1, fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: t.INK70, ...oneLine }}><span aria-hidden="true" style={{ color: heatOf(t, role) }}>★ </span>{item.badge}</div> : null}
        <div data-pc-name="" data-pc-featured-name={item.badge ? '' : undefined} style={{ fontFamily: HEAD, fontSize: 15, fontWeight: 650, lineHeight: 1.25, letterSpacing: '-0.015em', color: t.INK, ...clamp2 }}>{item.name}</div>
        {item.price || item.facts.line ? (
          <div style={{ marginTop: 2, fontFamily: SANS, fontSize: 12.5, lineHeight: 1.35, color: t.INK70, ...clamp2 }}>
            {item.price ? <b data-pc-price="" style={{ fontFamily: HEAD, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{item.price}</b> : null}
            {item.price && item.facts.line ? ' · ' : ''}{item.facts.line}
          </div>
        ) : null}
      </div>
      {item.onAssign || item.onDuplicate ? (
        <div style={{ ...onTop, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {item.onDuplicate ? (
            <button type="button" data-pc-press="" data-pc-action="copy" onClick={item.onDuplicate} aria-label={tr('coach:workoutEditor.copyName', { defaultValue: 'Duplicate {name}', name: item.name })} title={tr('coach:head.copy', { defaultValue: 'Copy' })}
              style={{ flexShrink: 0, minWidth: 44, minHeight: 44, marginRight: -4, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', color: t.INK70 }}><CopyIcon /></button>
          ) : null}
          {item.onAssign ? <PcCompact t={t} label={tr('coach:head.assign', { defaultValue: 'Assign' })} aria={tr('coach:plans.assignAria', { defaultValue: 'Assign {name} to a client', name: item.name })} onClick={item.onAssign} tag="assign" small /> : null}
        </div>
      ) : <span aria-hidden="true" style={{ flexShrink: 0, color: t.INK50, fontSize: 18, paddingRight: 2 }}>›</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The page body under the masthead (the page keeps its masthead row, its clean type and its footer).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function BSProCatalog({ t, model: m }) {
  const tr = useShapeTr();
  const photo = bsProCatalogPhotos(m.role);
  const withFacts = (it) => ({ ...it, facts: bsProCatalogFacts(it.meta, tr) });
  // The most popular plan is the first row of the list under it, marked ★: one list, not a card and a list.
  // The signed-out sample's top pick of a list is the same row there too, when the list holds it (its
  // Edit is the row's tap, its Duplicate the row's Copy); a top pick the list does not hold keeps its tile.
  const sections = [];
  let lead = null;
  let pick = null;
  const bare = (x) => String(x || '').trim().replace(/\.$/, '').toLowerCase();
  (m.sections || []).forEach((s) => {
    if (s.kind === 'featured') { lead = s.item; return; }
    if (s.kind === 'lead') { pick = s; return; }
    if (s.kind === 'list' && lead) { sections.push({ ...s, items: [lead, ...(s.items || [])], empty: null }); lead = null; return; }
    if (s.kind === 'list' && pick) {
      const items = s.items || [];
      const at = items.findIndex((it) => bare(it.name) === bare(pick.lead.title));
      if (at >= 0) {
        const hit = { ...items[at], badge: pick.lead.badge };
        sections.push({ ...s, items: [hit, ...items.slice(0, at), ...items.slice(at + 1)] });
      } else { sections.push(pick, s); }
      pick = null;
      return;
    }
    sections.push(s);
  });
  if (pick) sections.push(pick);
  if (lead) sections.unshift({ kind: 'list', key: 'featured', head: lead.badge, items: [{ ...lead, badge: null }] });
  let lists = 0;
  const out = sections.map((s, si) => {
    if (s.kind === 'lead') {
      const it = { key: `lead-${s.lead.title}`, name: s.lead.title, demo: true, facts: bsProCatalogFacts(s.lead.meta, tr) };
      return <PcLead key={`l${si}`} t={t} role={m.role} item={it} src={photo(it)} lead={s.lead} />;
    }
    const items = (s.items || []).map(withFacts);
    const first = lists === 0 && si === 0;
    lists += 1;
    return (
      <section key={s.key || si} data-pc-section={s.key}>
        <PcHead t={t} title={s.head} trail={s.sortable ? null : s.trail} first={first} />
        {s.action ? <button type="button" data-pc-press="" onClick={s.action.onClick} style={{ ...pcPill(t), marginBottom: 8 }}>{s.action.label}</button> : null}
        {s.miss ? <div data-pc-miss="" style={{ padding: '10px 0 14px', fontFamily: SANS, fontSize: 14, color: t.INK70 }}>{s.miss}</div> : null}
        {items.length ? <div>{items.map((it, i) => <PcRow key={it.key} t={t} tr={tr} role={m.role} item={it} src={photo(it)} i={i} />)}</div> : null}
        {s.node ? <div style={{ marginTop: 8 }}>{s.node}</div> : null}
        <PcEmpty t={t} empty={s.empty} />
      </section>
    );
  });
  const scratch = t.isLight ? { bg: '#0a7a72', fg: '#ffffff' } : { bg: '#34d6c5', fg: '#06201d' };
  return (
    <div data-pro-catalog="" data-pro-role={m.role} style={{ '--pc-teal': tealOf(t), padding: `12px ${t.padX}px 28px`, overflowX: 'clip' }}>
      <style>{PC_CSS}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 12px', minHeight: 44 }}>
        <h1 data-tour="hero-plans" style={{ flex: '1 1 120px', margin: 0, minWidth: 0, fontFamily: HEAD, fontSize: 28, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05, color: t.INK, overflowWrap: 'break-word' }}>
          {m.title}<span aria-hidden="true" style={{ color: heatOf(t, m.role) }}>.</span>
        </h1>
        {/* ＋ From scratch: the page's one filled action, the lit pill the Clients page gives ＋ Add (32px in 44). */}
        {m.onScratch ? (
          <button type="button" data-create="scratch" data-pc-press="" onClick={m.onScratch} style={{ flexShrink: 0, minWidth: 44, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span data-pc-pill="" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 32, padding: '0 14px', borderRadius: 99, boxSizing: 'border-box', background: scratch.bg, color: scratch.fg, fontFamily: SANS, fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap' }}>{tr('coach:plans.fromScratch', { defaultValue: '＋ From scratch' })}</span>
          </button>
        ) : null}
      </div>
      <p data-deck-published="" style={{ margin: '2px 0 0', fontFamily: SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: t.INK70 }}>{[m.published, m.publishedRest].filter(Boolean).join(' · ')}</p>
      {m.note ? <div role="status" data-pc-in="" style={{ ...pcTile(t, 999), marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', color: t.INK, fontFamily: SANS, fontSize: 13.5, fontWeight: 600 }}><span aria-hidden="true" style={{ color: tealInk(t) }}>✓</span>{m.note}</div> : null}
      {m.alert ? (
        <div role="alert" style={{ ...pcTile(t, 14), marginTop: 12, padding: '6px 6px 6px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0, color: t.RUST || '#c0533b', fontFamily: SANS, fontSize: 13.5, lineHeight: 1.35 }}>{m.alert.text}</span>
          <button type="button" onClick={m.alert.onRetry} style={{ ...pcPill(t), flexShrink: 0 }}>{m.alert.retry}</button>
        </div>
      ) : null}
      <PcTabs t={t} m={m} />
      <PcFind t={t} m={m} />
      <PcSkeleton t={t} m={m} />
      {out}
      {m.music ? <div data-pc-music="" style={{ marginTop: 6 }}>{m.music}</div> : null}
      {m.overlay || null}
    </div>
  );
}
