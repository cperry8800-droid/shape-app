import React from 'react';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS } from './bsCleanType.jsx';
// ─── PROGRAMS / PLANS · THE TILES ────────────────────────────────────────────────────────────────
// The coach's catalogue page (the trainer's Programs, the nutritionist's Plans), as the owner picked it
// (2026-11-04, of three looks: "B for programs just reduce size of this button"; before them, "keep designs
// simple … modern, appealing, easy to navigate, not overwhelming, not analog", of the member profile "this
// looks better", and "reduce the coloring and simplify UI more"). The member profile's furniture, restrained:
//   · the title with its role's full stop, what is published, and ＋ From scratch;
//   · the kinds as the profile's icon tabs (the picked icon in the role's colour), then the search;
//   · the most popular plan (or the sample's top pick) as the one larger tile, its Assign the page's one
//     filled teal action, a compact pill;
//   · Popular / Price / Rating as pills (the picked one in ink), and every plan a tile in the paper's own
//     colour: its photo, its name, length and facts, its price, and a quiet Assign;
//   · Enrolled as tiles of members' facet avatars.
//
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

// A tile in the paper's own colour, lifted: the member profile's quiet tile (bsMpTile) with a soft shadow.
const pcTile = (t, r = 20) => ({
  position: 'relative', boxSizing: 'border-box', borderRadius: r,
  background: t.isLight ? `linear-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0.7)), ${t.PAPER}` : `linear-gradient(${inkA(t, 0.06)}, ${inkA(t, 0.06)}), ${t.PAPER}`,
  border: `1px solid ${inkA(t, t.isLight ? 0.07 : 0.1)}`,
  boxShadow: t.isLight
    ? `0 1px 2px ${inkA(t, 0.06)}, 0 14px 28px -18px ${inkA(t, 0.38)}`
    : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 32px -20px rgba(0,0,0,0.95)',
});
// The featured tile's depth: the same lift, a step further off the page.
const pcLift = (t) => (t.isLight ? `0 2px 4px ${inkA(t, 0.08)}, 0 26px 44px -22px ${inkA(t, 0.5)}` : '0 2px 4px rgba(0,0,0,0.4), 0 28px 48px -22px rgba(0,0,0,1)');
// A soft pill: the profile's chips and quiet buttons, 44px.
const pcPill = (t) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '0 16px', boxSizing: 'border-box',
  borderRadius: 999, border: `1px solid ${inkA(t, t.isLight ? 0.1 : 0.14)}`, background: t.isLight ? 'rgba(255,255,255,0.72)' : inkA(t, 0.06),
  color: t.INK, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
});
// The picked sort: the ink, filled.
const pcOn = (t) => ({ background: t.INK, color: t.PAPER, border: `1px solid ${t.INK}` });
// The empty list's Build from scratch: teal, filled.
const pcPrimary = (t) => ({ ...pcPill(t), border: 0, background: tealOf(t), color: t.isLight ? '#ffffff' : '#04201d', fontWeight: 700 });
const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' };
const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const onTop = { position: 'relative', zIndex: 2 };

// The motion, in one sheet: tiles rise in, lift under a pointer and sink under a finger, the picked tab's
// mark eases in. Under reduced motion none of it runs, and every resting style is the finished one.
const PC_CSS = `
@keyframes bspc-in { from { opacity: 0; transform: translateY(12px); } }
@keyframes bspc-shimmer { from { background-position: -320px 0; } to { background-position: 320px 0; } }
[data-pro-catalog] button { -webkit-tap-highlight-color: transparent; }
[data-pro-catalog] button:focus-visible, [data-pro-catalog] input:focus-visible { outline: 2px solid var(--pc-teal); outline-offset: 2px; }
[data-pro-catalog] [data-pc-open]:focus-visible { outline-offset: -3px; }
[data-pc-in] { animation: bspc-in 440ms cubic-bezier(.2,.8,.2,1) both; }
[data-pc-lift] { transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
[data-pc-lift]:active { transform: scale(0.982); }
[data-pc-press] { transition: transform 160ms ease; }
[data-pc-press]:active { transform: scale(0.96); }
[data-pc-tab-mark] { transition: background-color 220ms ease, box-shadow 220ms ease; }
[data-pc-skel] { background-size: 640px 100% !important; animation: bspc-shimmer 1.4s linear infinite; }
@media (hover: hover) { [data-pc-lift]:hover { transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) {
  [data-pro-catalog] *, [data-pro-catalog] *::before, [data-pro-catalog] *::after { animation: none !important; transition: none !important; }
  [data-pc-lift]:hover, [data-pc-lift]:active, [data-pc-press]:active { transform: none !important; }
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
  return { len, line: [lenText, stats.length ? stats.join(' · ') : rest].filter(Boolean).join(' · ') };
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
// A compact pill (owner, 2026-11-04: "just reduce size of this button"): 34px drawn inside a 44px button.
// `kind` 'primary' is the page's one filled teal action (the most popular plan's Assign, the sample's Edit);
// 'quiet' the soft pill every other plan's Assign wears; 'bare' the words alone (Copy, Duplicate, Share).
function PcCompact({ t, label, aria, onClick, kind = 'quiet', tag }) {
  const look = kind === 'primary'
    ? { background: tealOf(t), color: t.isLight ? '#ffffff' : '#04201d', border: 0 }
    : kind === 'quiet'
      ? { background: t.isLight ? 'rgba(255,255,255,0.72)' : inkA(t, 0.06), color: t.INK, border: `1px solid ${inkA(t, t.isLight ? 0.12 : 0.16)}` }
      : { background: 'transparent', color: t.INK70, border: 0 };
  return (
    <button type="button" data-pc-press="" data-pc-compact={kind} data-pc-action={tag} onClick={onClick} aria-label={aria}
      style={{ ...onTop, flexShrink: 0, minWidth: 44, minHeight: 44, margin: '-5px 0', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <span data-pc-pill="" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 34, padding: kind === 'bare' ? '0 6px' : '0 14px', boxSizing: 'border-box', borderRadius: 999, fontFamily: SANS, fontSize: 13, fontWeight: kind === 'bare' ? 600 : 700, whiteSpace: 'nowrap', ...look }}>{label}</span>
    </button>
  );
}

// A member's face, as the facet avatar the app gives members (the flat cut: a thin teal frame, no glow);
// initials in a plain disc if the client module has not put it on window yet.
function PcFace({ t, ini, photo, size = 32 }) {
  const Facet = typeof window !== 'undefined' ? window.BSFacetAvatar : null;
  if (Facet) return <Facet size={size} initial={ini} photo={photo || undefined} c={tealOf(t)} showRank={false} flat />;
  return <span style={{ width: size, height: size, borderRadius: 99, display: 'grid', placeItems: 'center', background: t.PAPER2, color: t.INK, fontFamily: SANS, fontSize: 11, fontWeight: 700 }}>{ini}</span>;
}
const pcDemoFace = (key, j) => `${pcBase()}faces/member-${String(((pcHash(key) + j * 5) % 12) + 1).padStart(2, '0')}.jpg`;

// ── The page's parts ─────────────────────────────────────────────────────────────────────────────
const PC_ICONS = {
  plans: <><rect x="5.5" y="4" width="13" height="17" rx="2.5" /><path d="M9 4.2V3h6v1.2" /><path d="M9 10h6M9 14h4" /></>,
  workouts: <><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" /></>,
  programs: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  diet: <><path d="M5 19c0-8.3 5.6-13.4 14-14-0.6 8.4-5.7 14-14 14z" /><path d="M5 19l7.5-7.5" /></>,
  soundtracks: <><path d="M9 17V5.5l10-2.2v12.2" /><circle cx="6.8" cy="17" r="2.2" /><circle cx="16.8" cy="15.5" r="2.2" /></>,
};
// The kinds as the member profile's icon tabs: the picked icon in the role's colour on a raised square.
function PcIconTabs({ t, m }) {
  const heat = heatOf(t, m.role);
  return (
    <div role="tablist" aria-label={m.tabsAria} style={{ display: 'grid', gridTemplateColumns: `repeat(${m.tabs.length}, minmax(0, 1fr))`, gap: 4, marginTop: 14 }}>
      {m.tabs.map(([k, label]) => {
        const on = m.tab === k;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} data-pc-tab={k} data-pc-press="" onClick={() => m.onTab(k)}
            style={{ minWidth: 0, minHeight: 60, padding: '6px 2px', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: on ? t.INK : t.INK50 }}>
            <span aria-hidden="true" data-pc-tab-mark="" style={{ width: 46, height: 32, borderRadius: 12, display: 'grid', placeItems: 'center', background: on ? (t.isLight ? 'rgba(255,255,255,0.9)' : inkA(t, 0.1)) : 'transparent', boxShadow: on ? (t.isLight ? `0 4px 12px -6px ${inkA(t, 0.4)}` : 'inset 0 1px 0 rgba(255,255,255,0.06)') : 'none' }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={on ? heat : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{PC_ICONS[k] || PC_ICONS.plans}</svg>
            </span>
            <span style={{ maxWidth: '100%', fontFamily: SANS, fontSize: 12.5, fontWeight: on ? 700 : 550, lineHeight: 1.15, textAlign: 'center', overflowWrap: 'anywhere' }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
function PcSearch({ t, m }) {
  if (!m.search) return null;
  const s = m.search;
  return (
    <label style={{ ...pcTile(t, 16), boxShadow: 'none', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, minHeight: 46, marginTop: 8, padding: '0 14px' }}>
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={t.INK70} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
      <input type="search" value={s.value} onChange={(e) => s.onChange(e.target.value)} aria-label={s.aria} placeholder={s.placeholder}
        style={{ flex: 1, minWidth: 0, width: '100%', minHeight: 44, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: SANS, fontSize: 16 }} />
    </label>
  );
}
function PcHead({ t, title, trail = null }) {
  return (
    <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44 }}>
      <h2 style={{ margin: 0, minWidth: 0, fontFamily: HEAD, fontSize: 19, fontWeight: 650, letterSpacing: '-0.02em', color: t.INK, overflowWrap: 'anywhere' }}>{title}</h2>
      {trail ? <button type="button" data-pc-press="" data-pc-trail="" onClick={trail.onClick} style={{ ...pcPill(t), flexShrink: 0, padding: '0 14px' }}>{trail.icon ? <span aria-hidden="true" style={{ color: t.INK70 }}>{trail.icon}</span> : null}{trail.label}</button> : null}
    </div>
  );
}
function PcSort({ t, m }) {
  if (!m.sort) return null;
  return (
    <div role="group" data-pc-sort="" aria-label={m.sort.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {m.sort.options.map(([k, label]) => {
        const on = m.sort.value === k;
        return <button key={k} type="button" aria-pressed={on} data-pc-press="" onClick={() => m.sort.onPick(k)} style={{ ...pcPill(t), padding: '0 14px', fontSize: 13, ...(on ? pcOn(t) : { color: t.INK70 }) }}>{label}</button>;
      })}
    </div>
  );
}
// An empty list: what is missing, then the way to make one (From scratch, Ask Nora) where the page has it.
function PcEmpty({ t, empty }) {
  if (!empty) return null;
  return (
    <div data-pc-empty="" style={{ ...pcTile(t, 20), boxShadow: 'none', marginTop: 10, padding: '18px 16px 12px', textAlign: 'center' }}>
      <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{empty.label}</div>
      {empty.build ? <button type="button" data-pc-press="" onClick={empty.build.onClick} style={{ ...pcPrimary(t), marginTop: 12 }}>{empty.build.label}</button> : null}
      {empty.nora ? <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>{empty.nora}</div> : null}
    </div>
  );
}
// Loading: plain shapes that shimmer, never sample figures.
function PcSkeleton({ t, m }) {
  if (!m.loading) return null;
  const sheen = { background: `linear-gradient(90deg, ${inkA(t, 0.05)} 0%, ${inkA(t, 0.1)} 50%, ${inkA(t, 0.05)} 100%)` };
  return (
    <div role="status" data-pc-loading="" aria-label={m.loading} style={{ marginTop: 18 }}>
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: t.INK50, marginBottom: 10 }}>{m.loading}</div>
      <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2].map((i) => <span key={i} data-pc-skel="" style={{ display: 'block', height: 84, borderRadius: 20, ...sheen }} />)}</div>
    </div>
  );
}
// The most popular plan (or the sample's top pick) as the one larger tile.
function PcFeatured({ t, tr, role, item, src, lead = null }) {
  const line = lead ? keepStar(lead.meta) : item.facts.line;
  return (
    <div data-pc-featured="" data-pc-in="" data-pc-lift="" style={{ ...pcTile(t, 24), marginTop: 18, padding: 14, boxShadow: pcLift(t) }}>
      {!lead ? <PcOpen label={tr('coach:plans.openAria', { defaultValue: 'Open {name}', name: item.name })} onOpen={item.onOpen} /> : null}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <PcThumb t={t} item={item} src={src} size={84} r={20} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontFamily: SANS, fontSize: 12, fontWeight: 700, color: t.INK70, ...oneLine }}><span aria-hidden="true" style={{ color: heatOf(t, role) }}>★ </span>{lead ? lead.badge : item.badge}</span>
          <div data-pc-featured-name="" style={{ marginTop: 5, fontFamily: HEAD, fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.12, color: t.INK, ...clamp2 }}>{lead ? lead.title : item.name}</div>
          {line ? <div style={{ marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 1.35, color: t.INK70, ...clamp2 }}>{line}</div> : null}
        </div>
      </div>
      {lead ? (
        <div style={{ ...onTop, marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 6px' }}>
          {lead.actions.map((x, i) => <PcCompact key={x.key} t={t} label={x.label} onClick={x.onClick} kind={i === 0 ? 'primary' : 'bare'} tag={x.key} />)}
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {item.price ? <span data-pc-price="" style={{ minWidth: 0, fontFamily: HEAD, fontSize: 22, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', ...oneLine }}>{item.price}</span> : <span />}
          {item.onAssign ? <PcCompact t={t} label={tr('coach:head.assign', { defaultValue: 'Assign' })} aria={tr('coach:plans.assignAria', { defaultValue: 'Assign {name} to a client', name: item.name })} onClick={item.onAssign} kind="primary" tag="assign" /> : null}
        </div>
      )}
    </div>
  );
}
// A plan as a tile: its photo, its name, length and facts, its price, and a quiet Assign (Copy under it).
function PcRow({ t, tr, item, src, i }) {
  return (
    <div data-pc-item="" data-pc-in="" data-pc-lift="" style={{ ...pcTile(t, 20), marginTop: i ? 10 : 0, padding: 10, display: 'flex', alignItems: 'center', gap: 12, animationDelay: `${Math.min(i, 8) * 50}ms` }}>
      <PcOpen label={tr('coach:plans.openAria', { defaultValue: 'Open {name}', name: item.name })} onOpen={item.onOpen} />
      <PcThumb t={t} item={item} src={src} size={60} r={16} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div data-pc-name="" style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 650, lineHeight: 1.2, letterSpacing: '-0.01em', color: t.INK, ...clamp2 }}>{item.name}</div>
        {item.facts.line ? <div style={{ marginTop: 4, fontFamily: SANS, fontSize: 12.5, lineHeight: 1.35, color: t.INK70, ...clamp2 }}>{item.facts.line}</div> : null}
        {item.price ? <div data-pc-price="" style={{ marginTop: 4, fontFamily: HEAD, fontSize: 16, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', ...oneLine }}>{item.price}</div> : null}
      </div>
      {item.onAssign || item.onDuplicate ? (
        <div style={{ ...onTop, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {item.onAssign ? <PcCompact t={t} label={tr('coach:head.assign', { defaultValue: 'Assign' })} aria={tr('coach:plans.assignAria', { defaultValue: 'Assign {name} to a client', name: item.name })} onClick={item.onAssign} tag="assign" /> : null}
          {item.onDuplicate ? <PcCompact t={t} label={tr('coach:head.copy', { defaultValue: 'Copy' })} aria={tr('coach:workoutEditor.copyName', { defaultValue: 'Duplicate {name}', name: item.name })} onClick={item.onDuplicate} kind="bare" tag="copy" /> : null}
        </div>
      ) : <span aria-hidden="true" style={{ flexShrink: 0, color: t.INK50, fontSize: 18, paddingRight: 4 }}>›</span>}
    </div>
  );
}
// Enrolled: a plan, its members' faces (facet avatars) and how many are on it, a tile each.
function PcEnrolled({ t, s }) {
  const rows = s.rows || [];
  return (
    <section data-pc-section="enrolled">
      <PcHead t={t} title={s.head} />
      {rows.length ? (
        <div style={{ marginTop: 6 }}>
          {rows.map((e, i) => (
            <button key={e.key} type="button" data-pc-press="" data-pc-enrolled="" onClick={e.onClick} aria-label={e.aria}
              style={{ ...pcTile(t, 18), marginTop: i ? 8 : 0, display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 60, padding: '8px 12px 8px 14px', textAlign: 'left', cursor: 'pointer', color: t.INK }}>
              <span style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 15, fontWeight: 600, ...oneLine }}>{e.name}</span>
              <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
                {e.faces.map((ini, j) => <span key={j} style={{ marginLeft: j ? -8 : 0, display: 'inline-flex' }}><PcFace t={t} ini={ini} photo={e.demo ? pcDemoFace(e.key, j) : null} /></span>)}
              </span>
              <span style={{ flexShrink: 0, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{e.label}</span>
            </button>
          ))}
        </div>
      ) : <PcEmpty t={t} empty={s.empty} />}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The page body under the masthead (the page keeps its masthead row, its clean type and its footer).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function BSProCatalog({ t, model: m }) {
  const tr = useShapeTr();
  const photo = bsProCatalogPhotos(m.role);
  const withFacts = (it) => ({ ...it, facts: bsProCatalogFacts(it.meta, tr) });
  const out = (m.sections || []).map((s, si) => {
    if (s.kind === 'featured') { const it = withFacts(s.item); return <PcFeatured key={`f${si}`} t={t} tr={tr} role={m.role} item={it} src={photo(it)} />; }
    if (s.kind === 'lead') {
      const it = { key: `lead-${s.lead.title}`, name: s.lead.title, demo: true, facts: bsProCatalogFacts(s.lead.meta, tr) };
      return <PcFeatured key={`l${si}`} t={t} tr={tr} role={m.role} item={it} src={photo(it)} lead={s.lead} />;
    }
    if (s.kind === 'enrolled') return <PcEnrolled key={`e${si}`} t={t} s={s} />;
    const items = (s.items || []).map(withFacts);
    return (
      <section key={s.key || si} data-pc-section={s.key}>
        <PcHead t={t} title={s.head} trail={s.sortable ? null : s.trail} />
        {s.sortable ? <PcSort t={t} m={m} /> : null}
        {s.action ? <button type="button" data-pc-press="" onClick={s.action.onClick} style={{ ...pcPill(t), marginTop: 8 }}>{s.action.label}</button> : null}
        {s.miss ? <div data-pc-miss="" style={{ padding: '14px 2px', fontFamily: SANS, fontSize: 15, color: t.INK70 }}>{s.miss}</div> : null}
        {items.length ? <div style={{ marginTop: 10 }}>{items.map((it, i) => <PcRow key={it.key} t={t} tr={tr} item={it} src={photo(it)} i={i} />)}</div> : null}
        {s.node ? <div style={{ marginTop: 8 }}>{s.node}</div> : null}
        <PcEmpty t={t} empty={s.empty} />
      </section>
    );
  });
  return (
    <div data-pro-catalog="" data-pro-role={m.role} style={{ '--pc-teal': tealOf(t), padding: `14px ${t.padX}px 28px`, overflowX: 'clip' }}>
      <style>{PC_CSS}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ flex: '1 1 150px' }}>
          <h1 data-tour="hero-plans" style={{ margin: 0, fontFamily: HEAD, fontSize: 30, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.05, color: t.INK, overflowWrap: 'break-word' }}>
            {m.title}<span aria-hidden="true" style={{ color: heatOf(t, m.role) }}>.</span>
          </h1>
          <span data-deck-published="" style={{ display: 'block', marginTop: 6, fontFamily: SANS, fontSize: 13.5, color: t.INK70 }}>{[m.published, m.publishedRest].filter(Boolean).join(' · ')}</span>
        </span>
        {m.onScratch ? <button type="button" data-create="scratch" data-pc-press="" onClick={m.onScratch} style={{ ...pcPill(t), flexShrink: 0 }}>{tr('coach:plans.fromScratch', { defaultValue: '＋ From scratch' })}</button> : null}
      </div>
      {m.note ? <div role="status" data-pc-in="" style={{ ...pcTile(t, 999), marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', color: t.INK, fontFamily: SANS, fontSize: 13.5, fontWeight: 600 }}><span aria-hidden="true" style={{ color: tealInk(t) }}>✓</span>{m.note}</div> : null}
      {m.alert ? (
        <div role="alert" style={{ ...pcTile(t, 16), marginTop: 14, padding: '6px 6px 6px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0, color: t.RUST || '#c0533b', fontFamily: SANS, fontSize: 13.5, lineHeight: 1.35 }}>{m.alert.text}</span>
          <button type="button" onClick={m.alert.onRetry} style={{ ...pcPill(t), flexShrink: 0 }}>{m.alert.retry}</button>
        </div>
      ) : null}
      <PcIconTabs t={t} m={m} />
      <PcSearch t={t} m={m} />
      <PcSkeleton t={t} m={m} />
      {out}
      {m.music ? <div data-pc-music="" style={{ marginTop: 6 }}>{m.music}</div> : null}
      {m.overlay || null}
    </div>
  );
}
