import React from 'react';
import { bsRaised } from './BSProInstrument.jsx';
import { bsDash, bsDashA } from './BSDash.jsx';
// ─── THE MARKETPLACE DIRECTORY ("Find your coach.") ─────────────────────────────────────────────
// Owner, 2026-11-04, after the run of redesigns (Goals, Home's Team, the coach pages): "and these",
// "the marketplace". The directory in the look those pages share, so choosing a coach is easy:
//   · the masthead every page has (the mark, Vol·No and the tool pill), ← Back with the eyebrow;
//   · the search and the All · Trainers · Nutritionists switch lead, and a role's filters are one
//     row of chips (category, format, location, sort), each the native picker under a pill;
//   · All opens on the coach of the week as one raised card: their face, role and format, one line
//     of their words, Rating · Clients · Years as tiles, their top offers and See the profile;
//     then This week as a grid of coach tiles, What's hot, and the two Apply doors;
//   · a role, a search or See all is the numbered list: each coach a 72px row with their face
//     (their photo in their role's ring, else their initials on it), name, role · credential ·
//     place · standing, rate and rating.
//
// Moved out of iosAppBroadsheetMarketplace.jsx when it was redesigned, as BSGoals and BSLeaderboard
// were out of the client module.
//
// ⚠ IT DRAWS, IT DOES NOT DECIDE. Every rule stays in the marketplace module, which hands this view
// what it reads: the filtering and the sorts, the rating (a live coach's reviews, or New), the
// standing (their Shape Score), the portrait ladder, demo or live data and the deep link. A card
// here is that module's reading of one coach (mktDirCard there), so the two can never disagree.
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

// The role's mark (rings, edges) and its words' colour, each readable on its paper: rust for a
// trainer, gold for a nutritionist (BSHomeTeam's pairs).
function mktDirRole(t, nutri) {
  return nutri
    ? { mark: t.isLight ? '#a07a2e' : '#d8b25a', text: t.isLight ? '#7a5a1e' : '#d8b25a' }
    : { mark: '#c0533b', text: t.isLight ? '#9c3b26' : '#e98a73' };
}
const mktDirRoleWord = (tr, nutri) => (nutri
  ? tr('marketplace:role.nutritionist', { defaultValue: 'Nutritionist' })
  : tr('marketplace:role.trainer', { defaultValue: 'Trainer' }));

// Two initials, a "Dr." left off ("Dr. Kevin Park" is KP).
function mktDirInitials(name) {
  const p = String(name || '').replace(/^dr\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || '·';
}

// "$55/mo" in the member's language, the figure set apart from its unit: the locale's own
// "{monthly}/mo" with a mark where the figure goes, split around it.
const MKT_DIR_SLOT = '⁣';
function mktDirPerMonth(tr) {
  const s = String(tr('coach:rates.rowSubMonthly', { defaultValue: '{monthly}/mo', monthly: MKT_DIR_SLOT }));
  const i = s.indexOf(MKT_DIR_SLOT);
  return i < 0 ? ['', ''] : [s.slice(0, i), s.slice(i + MKT_DIR_SLOT.length)];
}

// Focus rings, the search's placeholder and the field's ring, scoped to the directory.
const MKT_DIR_CSS = (teal, ph) => `[data-mkt-dir] input::placeholder{color:${ph}}`
  + `[data-mkt-dir] [data-mkt-search]:focus-within{box-shadow:0 0 0 2px ${teal}}`
  + `[data-mkt-dir] [data-mkt-chip]:focus-within [data-mkt-chip-face]{box-shadow:0 0 0 2px ${teal}}`
  + `[data-mkt-dir] button:focus-visible{outline:2px solid ${teal};outline-offset:2px}`
  + `[data-mkt-dir] [data-mkt-press]{transition:transform 140ms ease}[data-mkt-dir] [data-mkt-press]:active{transform:scale(0.985)}`
  + `@media (prefers-reduced-motion:reduce){[data-mkt-dir] [data-mkt-press]{transition:none}[data-mkt-dir] [data-mkt-press]:active{transform:none}}`;

// A coach's face: their photo in a ring of their role's mark, or their initials on a wash of it when
// there is no photo or it fails to load. The name beside it says who it is, so it is hidden.
function MktDirFace({ photo, name, nutri, size = 44, edge = null }) {
  const { useBS } = window;
  const t = useBS();
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [photo]);
  const role = mktDirRole(t, nutri);
  const box = { width: size, height: size, flexShrink: 0, borderRadius: 999, boxSizing: 'border-box', border: `2px solid ${role.mark}`, boxShadow: edge ? `0 0 0 3px ${edge}` : 'none' };
  if (photo && !broken) {
    return <img data-mkt-face="photo" src={photo} alt="" aria-hidden="true" onError={() => setBroken(true)} style={{ ...box, display: 'block', objectFit: 'cover', background: t.PAPER2 }} />;
  }
  return (
    <span data-mkt-face="initials" aria-hidden="true" style={{ ...box, display: 'grid', placeItems: 'center', background: `linear-gradient(${bsDashA(role.mark, t.isLight ? 0.14 : 0.22)}, ${bsDashA(role.mark, t.isLight ? 0.14 : 0.22)}), ${t.PAPER}`, color: role.text, fontFamily: t.DISPLAY, fontSize: Math.round(size * 0.36), fontWeight: 700, letterSpacing: '-0.01em' }}>
      {mktDirInitials(name)}
    </span>
  );
}

// "$55" over its "/mo", in the figure's face and the unit's.
function MktDirPrice({ rate, perMonth, size = 17 }) {
  const { useBS } = window;
  const t = useBS();
  const [pre, post] = perMonth || ['', ''];
  const unit = { fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.02em', color: t.INK70 };
  if (rate == null || rate === '') return <span data-mkt-price="" style={{ fontFamily: t.DISPLAY, fontSize: size, fontWeight: 700, color: t.INK70 }}>—</span>;
  return (
    <span data-mkt-price="" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {pre ? <span style={unit}>{pre}</span> : null}
      <span style={{ fontFamily: t.DISPLAY, fontSize: size, fontWeight: 700, letterSpacing: '-0.01em', color: t.INK }}>${rate}</span>
      {post ? <span style={unit}>{post}</span> : null}
    </span>
  );
}

// The search: one rounded 42px field (smaller since the owner's "make these sections less cluttery and not as
// large", 2026-11-04), its ⌕ drawn, a 44px × to clear it. The words stay 16px, so iOS never zooms on focus.
function MktDirSearch({ value, onChange }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const hint = tr('marketplace:dir.searchPlaceholder', { defaultValue: 'Coaches, plans, playlists…' });
  return (
    <div data-mkt-search="" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '0 2px 0 13px', boxSizing: 'border-box', borderRadius: 12, background: D.track, border: `1px solid ${D.border}` }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.INK70} strokeWidth="2.2" strokeLinecap="round" style={{ flex: 'none' }}>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21" />
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} aria-label={hint} enterKeyHint="search" autoComplete="off"
        style={{ flex: 1, minWidth: 0, minHeight: 40, border: 0, outline: 'none', background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, letterSpacing: '-0.005em', padding: 0 }} />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label={tr('marketplace:dir.clearSearch', { defaultValue: 'Clear search' })}
          style={{ flex: 'none', width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', cursor: 'pointer', color: t.INK70, fontSize: 20, lineHeight: 1 }}>×</button>
      ) : null}
    </div>
  );
}

// One of a few: the role switch (tabs) and What's hot's kinds (toggles). A 34px track; each key is a
// 44px target holding a 28px pill, the one shown an ink pill. A long word takes more of the track.
function MktDirSwitch({ options, value, onChange, label, tabs = false }) {
  const { useBS } = window;
  const t = useBS();
  const D = bsDash(t);
  return (
    <div role={tabs ? 'tablist' : 'group'} aria-label={label} data-mkt-switch={tabs ? 'tabs' : 'group'} style={{ display: 'flex', alignItems: 'center', gap: 2, height: 34, padding: '0 3px', boxSizing: 'border-box', borderRadius: 999, background: D.track }}>
      {options.map(([k, l]) => {
        const on = k === value;
        const state = tabs ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on };
        return (
          <button key={k} type="button" {...state} onClick={() => onChange(k)} style={{ flex: '1 1 auto', minWidth: 0, minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <span style={{
              display: 'block', height: 28, lineHeight: '28px', padding: '0 8px', borderRadius: 999,
              background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70,
              fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
              transition: 'background .18s ease, color .18s ease',
            }}>{l}</span>
          </button>
        );
      })}
    </div>
  );
}

// A filter as a chip: the native picker laid over a 30px pill in a 44px target, so a tap opens the
// phone's own list. The pill reads the choice; a choice other than the first (the "all") is inked.
function MktDirChip({ value, options, onChange, label = null, glyph = null }) {
  const { useBS } = window;
  const t = useBS();
  const D = bsDash(t);
  const on = options.length > 0 && value !== options[0][0];
  const shown = (options.find(([v]) => v === value) || options[0] || [value, value])[1];
  return (
    <span data-mkt-chip={on ? 'on' : 'off'} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minHeight: 44, maxWidth: '100%' }}>
      <span data-mkt-chip-face="" aria-hidden="true" style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, maxWidth: '100%', boxSizing: 'border-box', padding: '0 9px 0 10px',
        borderRadius: 999, background: on ? t.INK : D.track, color: on ? t.PAPER : t.INK, border: `1px solid ${on ? t.INK : D.border}`,
        fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
      }}>
        {glyph ? <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700 }}>{glyph}</span> : null}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown}</span>
        <svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', opacity: 0.7 }}><path d="M1 1l3.5 3.5L8 1" /></svg>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label || undefined}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer', fontSize: 16, border: 0, WebkitAppearance: 'none', appearance: 'none' }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}

// A section's head: its mono kicker over a display title with the accent full stop, and on its right
// a 44px action or a control of its own (the list's sort).
function MktDirSection({ kicker, title, action = null, onAction = null, aside = null }) {
  const { useBS } = window;
  const t = useBS();
  const D = bsDash(t);
  return (
    <div data-mkt-section="" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
      <div style={{ minWidth: 0, paddingBottom: aside ? 5 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span aria-hidden="true" style={{ flex: 'none', width: 10, height: 2, background: D.mark.teal }} />
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kicker}</span>
        </div>
        <h2 style={{ margin: '5px 0 0', fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1, color: t.INK }}>{title}<span aria-hidden="true" style={{ color: D.mark.teal }}>.</span></h2>
      </div>
      {action ? (
        <button type="button" onClick={onAction} style={{ flex: 'none', minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: D.text.teal }}>{action} →</button>
      ) : aside ? <div style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>{aside}</div> : null}
    </div>
  );
}

// A coach's line under their name: their role (`roleWord`, the caller's words for it) in its colour,
// then what else is known of them, in the reading face. The role is in the words, never colour alone;
// a line with no role word is a second line, for the rest.
function MktDirMeta({ nutri, roleWord = null, parts, size = 12.5 }) {
  const { useBS } = window;
  const t = useBS();
  const role = mktDirRole(t, nutri);
  const rest = parts.filter(Boolean).join(' · ');
  if (!roleWord && !rest) return null;
  return (
    <span data-mkt-meta={roleWord ? 'role' : 'more'} style={{ display: 'block', fontFamily: t.BODY || t.DISPLAY, fontSize: size, fontWeight: 500, lineHeight: 1.3, color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {roleWord ? <><span style={{ color: role.text, fontWeight: 650 }}>{roleWord}</span>{rest ? ` · ${rest}` : ''}</> : rest}
    </span>
  );
}

// A rating as a figure: "★ 9.6" with its "/10" set small, or the word the marketplace gave (New).
function MktDirScore({ score, label, size = 19 }) {
  const { useBS } = window;
  const t = useBS();
  if (score == null || !Number.isFinite(Number(score))) return <>{label}</>;
  const small = { fontFamily: t.MONO, fontSize: Math.round(size * 0.52), fontWeight: 700, color: t.INK70, letterSpacing: 0 };
  return (
    <span data-mkt-score="" style={{ whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ ...small, fontSize: Math.round(size * 0.68), color: t.INK }}>★ </span>{Number(score).toFixed(1)}<span style={small}>/10</span>
    </span>
  );
}

// A price as a number to compare by ("$28" → 28); anything that isn't one sorts last.
const mktDirPriceNum = (x) => { const n = parseFloat(String(x == null ? '' : x).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : Infinity; };

// The coach of the week, condensed (owner, 2026-11-04: "this can be more condensed"): one raised card
// warmed by their role, the face beside the name, role · standing · place and one line of figures (the
// rating, then clients and years when they have some, never "0+"), one line of their own words, and
// along the foot what they sell (how many, from the lowest price) beside See the profile. A coach at
// capacity reads At capacity beside their name, as on the list (Codex on #2602). A tap anywhere on it
// opens them, and See the profile is the card's one button (the keyboard's way in).
function MktDirFeature({ feature }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const role = mktDirRole(t, feature.nutri);
  const meta = [mktDirRoleWord(tr, feature.nutri), feature.tier, feature.loc].filter(Boolean).join(' · ');
  const stats = [
    ['rating', <MktDirScore score={feature.score} label={feature.rating} size={13} />],
    feature.clients > 0 ? ['clients', `${feature.clients}+`, tr('marketplace:stat.clients', { defaultValue: 'Clients' })] : null,
    feature.years > 0 ? ['years', String(feature.years), tr('marketplace:stat.years', { defaultValue: 'Years' })] : null,
  ].filter(Boolean);
  const offers = feature.offers || [];
  const from = offers.length ? offers.reduce((a, o) => (mktDirPriceNum(o.price) < mktDirPriceNum(a.price) ? o : a), offers[0]).price : null;
  const mono = { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' };
  return (
    <section data-mkt-feature="" onClick={feature.onOpen} style={{ ...bsRaised(t, role.mark), padding: '12px 14px', cursor: 'pointer', color: t.INK }}>
      <div style={{ ...mono, letterSpacing: '0.16em', color: D.text.teal }}>{tr('marketplace:dir.featureEyebrow', { defaultValue: 'Feature · Coach of the week' })}</div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <MktDirFace photo={feature.photo} name={feature.name} nutri={feature.nutri} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1, color: t.INK }}>{feature.name}<span aria-hidden="true" style={{ color: role.mark }}>.</span></div>
          <div style={{ ...mono, marginTop: 4, color: role.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
          {feature.atCapacity ? <div style={{ marginTop: 6 }}><MktDirFull /></div> : null}
          <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>
            {stats.map(([k, v, l]) => (
              <span key={k} data-mkt-stat={k} style={{ whiteSpace: 'nowrap' }}>{v}{l ? <span style={{ marginLeft: 4, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{l}</span> : null}</span>
            ))}
          </div>
        </div>
      </div>
      {feature.quote ? (
        <div data-mkt-quote="" style={{ marginTop: 9, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13, lineHeight: 1.35, color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>“{feature.quote}”</div>
      ) : null}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        {from ? (
          <span data-mkt-offers="" style={{ ...mono, flex: 1, minWidth: 0, fontSize: 9, letterSpacing: '0.1em', color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tr('marketplace:dir.tracklist', { defaultValue: 'Tracklist' })} · {offers.length} · <span style={{ fontFamily: t.DISPLAY, fontSize: 14, letterSpacing: 0, textTransform: 'none', color: t.INK }}>{from}</span>+
          </span>
        ) : <span style={{ flex: 1 }} />}
        <button type="button" data-mkt-feature-open="" onClick={(e) => { e.stopPropagation(); feature.onOpen(); }}
          style={{ flex: 'none', minHeight: 44, padding: '0 16px', borderRadius: 999, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>
          {tr('marketplace:dir.seeProfile', { defaultValue: 'See the profile →' })}
        </button>
      </div>
    </section>
  );
}

// A coach of This week as a tile: their cover (when they have one) over their face, name, role ·
// standing over their place, then rating and rate. The whole tile is the button.
function MktDirTile({ card, perMonth }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  return (
    <button type="button" data-mkt-tile="" data-mkt-press="" onClick={card.onOpen} style={{ ...bsRaised(t), borderRadius: 18, minWidth: 0, minHeight: 156, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', cursor: 'pointer', color: t.INK }}>
      {card.cover ? <span aria-hidden="true" data-mkt-cover="" style={{ display: 'block', height: 52, background: `center/cover no-repeat url("${card.cover}")`, backgroundColor: t.PAPER2 }} /> : null}
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: card.cover ? '0 12px 12px' : 12 }}>
        <span style={{ display: 'block', marginTop: card.cover ? -22 : 0 }}><MktDirFace photo={card.photo} name={card.name} nutri={card.nutri} size={44} edge={card.cover ? t.PAPER : null} /></span>
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2, color: t.INK }}>{card.name}</span>
        <span style={{ display: 'block' }}>
          <MktDirMeta nutri={card.nutri} roleWord={mktDirRoleWord(tr, card.nutri)} parts={[card.tier]} size={12} />
          <MktDirMeta nutri={card.nutri} parts={[card.loc]} size={12} />
        </span>
        {card.atCapacity ? <span style={{ display: 'block' }}><MktDirFull /></span> : null}
        <span style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK70, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{card.rating}</span>
          <MktDirPrice rate={card.rate} perMonth={perMonth} size={15.5} />
        </span>
      </span>
    </button>
  );
}

// "At capacity" as a small pill: a dark slot, an amber ring for a dot, the words in mono. On the list's
// cards over the face, and on This week's tiles under the place.
function MktDirFull({ style = null }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const amber = t.AMBER || '#d8a23a';
  return (
    <span data-mkt-full="" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      background: t.isLight ? '#fbf8f1' : 'rgba(10,9,8,0.85)', border: `1px solid ${bsDashA(amber, 0.7)}`,
      fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.isLight ? t.INK : amber,
      ...style,
    }}>
      <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', border: `1.5px solid ${amber}`, boxSizing: 'border-box' }} />
      {tr('marketplace:listing.atCapacity', { defaultValue: 'At capacity' })}
    </span>
  );
}

// A coach in the list as a tall card, two across (the owner's A, 2026-11-04, for trainers and
// nutritionists alike: "better idea and cooler more immersive look on how to view trainers and
// nutritionists"): a glow of their role behind a big face, their place in the list in one corner and
// their Shape Score tier in the other ("make sure their shape score tier is shown"): their rung lit in
// its colour, or, for a coach who hasn't earned one yet, a dim New (the rung at no points is called
// Certified, which reads as a credential, so the marketplace names none: mktCoachTier). Along the foot
// their name, role · credential, place · vetted, and their rating beside their rate. Their listing's
// cover, when they have one, lies faint behind it. One button; a column, so the face sits at the top
// (a button centres what it holds). A coach who has turned off new clients reads At capacity on a pill
// over their dimmed face, so a member knows before they tap (owner, 2026-11-04: "if they are at capacity
// for new clients … have a little symbol or something that shows that"); their listing offers the
// waiting list.
function MktDirRow({ card, perMonth }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const role = mktDirRole(t, card.nutri);
  const vetted = card.verified ? tr('marketplace:listing.vetted', { defaultValue: '✓ Vetted' }) : null;
  const tierC = card.tierColor || role.mark;
  const ground = t.isLight ? '#fbf8f1' : '#161412';
  return (
    <button type="button" data-mkt-row="" data-mkt-press="" onClick={card.onOpen} style={{
      position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch', minWidth: 0, minHeight: 228, padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', color: t.INK,
      borderRadius: 20, border: `1px solid ${bsDashA(role.mark, 0.35)}`,
      background: `radial-gradient(120% 80% at 50% 0%, ${bsDashA(role.mark, t.isLight ? 0.2 : 0.32)}, transparent 70%), ${ground}`,
      boxShadow: t.isLight ? '0 14px 30px -20px rgba(15,14,12,0.4)' : `0 18px 34px -22px ${role.mark}`,
    }}>
      {card.cover ? <span aria-hidden="true" data-mkt-cover="" style={{ position: 'absolute', inset: 0, background: `center/cover no-repeat url("${card.cover}")`, opacity: 0.3 }} /> : null}
      {card.n != null ? <span data-mkt-rank="" style={{ position: 'absolute', top: 11, left: 12, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{String(card.n).padStart(2, '0')}</span> : null}
      {card.tier ? (
        <span data-mkt-tier="lit" style={{
          position: 'absolute', top: 8, right: 8, maxWidth: 'calc(100% - 48px)', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999,
          background: t.isLight ? bsDashA(tierC, 0.1) : 'rgba(0,0,0,0.45)', border: `1px solid ${bsDashA(tierC, 0.6)}`,
          fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          color: t.isLight ? t.INK : tierC, textShadow: t.isLight ? 'none' : `0 0 8px ${bsDashA(tierC, 0.7)}`,
        }}>
          <span aria-hidden="true" style={{ flex: 'none', width: 6, height: 6, borderRadius: 1, transform: 'rotate(45deg)', background: tierC, boxShadow: t.isLight ? 'none' : `0 0 6px ${tierC}` }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.tier}</span>
        </span>
      ) : (
        <span data-mkt-tier="none" style={{
          position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999,
          background: t.isLight ? bsDashA(t.INK, 0.05) : 'rgba(0,0,0,0.35)', border: `1px solid ${bsDashA(t.INK, 0.18)}`,
          fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: t.INK70,
        }}>
          <span aria-hidden="true" style={{ flex: 'none', width: 6, height: 6, borderRadius: 1, transform: 'rotate(45deg)', border: `1px solid ${t.INK50}`, boxSizing: 'border-box' }} />
          {tr('marketplace:rating.new', { defaultValue: 'New' })}
        </span>
      )}
      <span style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '30px 10px 0' }}>
        <span style={{ display: 'block', opacity: card.atCapacity ? 0.55 : 1 }}><MktDirFace photo={card.photo} name={card.name} nutri={card.nutri} size={80} /></span>
        {card.atCapacity ? <MktDirFull style={{ position: 'absolute', left: '50%', bottom: -9, transform: 'translateX(-50%)' }} /> : null}
      </span>
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '26px 12px 12px', background: `linear-gradient(transparent, ${t.isLight ? 'rgba(251,248,241,0.96)' : 'rgba(10,9,8,0.92)'} 40%)` }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.15, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</span>
        <span style={{ display: 'block', marginTop: 2 }}>
          <MktDirMeta nutri={card.nutri} roleWord={mktDirRoleWord(tr, card.nutri)} parts={[card.cred]} size={11.5} />
          <MktDirMeta nutri={card.nutri} parts={[card.loc, vetted]} size={11.5} />
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 7 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK70, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{card.rating}</span>
          <MktDirPrice rate={card.rate} perMonth={perMonth} size={15} />
        </span>
      </span>
    </button>
  );
}

// A plan in What's hot: its place, its name, its coach's role and name, its price. One button, to the
// coach who sells it.
function MktDirPlanRow({ plan, n, first = false }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  return (
    <button type="button" data-mkt-plan="" onClick={plan.onOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '10px 14px', boxSizing: 'border-box', border: 0, borderTop: first ? 0 : `1px solid ${t.HAIR}`, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: t.INK }}>
      <span style={{ flex: 'none', width: 18, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{String(n).padStart(2, '0')}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.title}</span>
        <span style={{ display: 'block', marginTop: 3 }}><MktDirMeta nutri={plan.nutri} roleWord={mktDirRoleWord(tr, plan.nutri)} parts={[plan.coach]} /></span>
      </span>
      <span style={{ flex: 'none', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{plan.price || tr('marketplace:dir.view', { defaultValue: 'View' })}</span>
    </button>
  );
}

// An Apply door: "Apply to be a trainer." on a raised tile, its full stop in the role's mark.
function MktDirApply({ nutri, onApply }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const role = mktDirRole(t, nutri);
  const word = nutri ? tr('marketplace:role.nutritionistLower', { defaultValue: 'nutritionist' }) : tr('marketplace:role.trainerLower', { defaultValue: 'trainer' });
  return (
    <button type="button" data-mkt-apply={nutri ? 'nutritionist' : 'trainer'} data-mkt-press="" onClick={onApply} style={{ ...bsRaised(t), borderRadius: 18, minWidth: 0, minHeight: 116, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, textAlign: 'left', cursor: 'pointer', color: t.INK }}>
      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70 }}>{tr('marketplace:apply.eyebrow', { defaultValue: 'Coaches' })}</span>
      <span style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2, color: t.INK }}>{tr('marketplace:apply.applyToBe', { defaultValue: 'Apply to be a' })} {word}<span aria-hidden="true" style={{ color: role.mark }}>.</span></span>
      <span style={{ marginTop: 'auto', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: D.text.teal }}>{tr('marketplace:apply.apply', { defaultValue: 'Apply →' })}</span>
    </button>
  );
}

// The page, off what the marketplace module hands it:
//   onBack, corner          ← Back, and the masthead's tool pill (bsMktCorner, the module's one copy)
//   query, onQuery          the search
//   pill, forceList, onPill the role ('All' | 'Trainers' | 'Nutritionists'); See all shows no tab lit
//   filters                 a role's filters, or null on All: { cat, cats, onCat, format, formats,
//                           onFormat, loc, locs, onLoc, sort, sorts, onSort, onClear } (format null
//                           for nutritionists), each list's first entry its "all"
//   loading, error          the live directory's read
//   deepMiss, onDeepMissDismiss  a deep link to a coach who is not listed
//   browsing, category, list     the numbered list (cards, each with its place n) and its kicker
//   feature, roster, onSeeAll    All's coach of the week and This week
//   planTab, onPlanTab, plans    What's hot, one kind at a time
//   onApply(role)                the Apply doors
export function BSMarketDirectory({
  onBack, corner = null, query = '', onQuery, pill = 'All', forceList = false, onPill, filters = null,
  loading = false, error = '', deepMiss = false, onDeepMissDismiss, browsing = false, category = null,
  list = [], feature = null, roster = [], onSeeAll, planTab = 'program', onPlanTab, plans = [], onApply,
}) {
  const { useBS, BSPage, BSFooter, BSBackRow, BSLogo } = window;
  const t = useBS();
  const tr = useShapeTr();
  const D = bsDash(t);
  const perMonth = mktDirPerMonth(tr);
  const mastTop = window.BS_MAST_TOP_CSS || BS_MAST_TOP_CSS;
  const roleTab = (p) => (p === 'Trainers'
    ? tr('marketplace:dir.tabTrainers', { defaultValue: 'Trainers' })
    : p === 'Nutritionists'
      ? tr('marketplace:dir.tabNutritionists', { defaultValue: 'Nutritionists' })
      : tr('marketplace:dir.tabAll', { defaultValue: 'All' }));
  // Fixed filter words (the value stays English: the list's filter compares it).
  const formatWord = (f) => ({
    'All formats': tr('marketplace:format.all', { defaultValue: 'All formats' }),
    'In-person': tr('marketplace:format.inPerson', { defaultValue: 'In-person' }),
    'Remote': tr('marketplace:format.remote', { defaultValue: 'Remote' }),
    'Hybrid': tr('marketplace:format.hybrid', { defaultValue: 'Hybrid' }),
  }[f] || f);
  const sortWord = (s) => ({
    'Most Popular': tr('marketplace:sort.popular', { defaultValue: 'Most Popular' }),
    'Highest Rated': tr('marketplace:sort.rated', { defaultValue: 'Highest Rated' }),
    'Lowest Price': tr('marketplace:sort.price', { defaultValue: 'Lowest Price' }),
    'Most Experience': tr('marketplace:sort.experience', { defaultValue: 'Most Experience' }),
  }[s] || s);
  // A filter is set when it reads other than its list's first entry (the "all"); sort is no filter.
  const isSet = (v, opts) => v != null && Array.isArray(opts) && opts.length > 0 && v !== opts[0];
  const filtered = !!filters && (isSet(filters.cat, filters.cats) || isSet(filters.format, filters.formats) || isSet(filters.loc, filters.locs));
  const clearFilters = filtered && filters.onClear ? (
    <button type="button" data-mkt-clear="" onClick={filters.onClear} style={{ minHeight: 44, padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: D.text.teal }}>
      {tr('coach:roster.clearFilters', { defaultValue: 'Clear filters' })}
    </button>
  ) : null;
  const listKicker = category && category !== 'All Categories' ? category : (pill === 'All' ? tr('marketplace:dir.kickerEveryone', { defaultValue: 'Everyone' }) : roleTab(pill));
  const planTabs = [
    ['program', tr('marketplace:plan.programs', { defaultValue: 'Programs' }), tr('marketplace:plan.programsLower', { defaultValue: 'programs' })],
    ['workout', tr('marketplace:plan.workouts', { defaultValue: 'Workouts' }), tr('marketplace:plan.workoutsLower', { defaultValue: 'workouts' })],
    ['meal', tr('marketplace:plan.mealPlans', { defaultValue: 'Meal plans' }), tr('marketplace:plan.mealPlansLower', { defaultValue: 'meal plans' })],
  ];
  const group = { ...bsRaised(t), borderRadius: 18 };
  const empty = { padding: '18px 16px', fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.45, color: t.INK70 };

  return (
    <BSPage>
      {/* The standing masthead row (the mark, Vol·No and the tool pill) at the page's buffer, and
          ← Back on its own row under it, the eyebrow at its right. */}
      <div style={{ padding: `${mastTop} ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: window.BS_MAST_ROW_H || 34 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {window.BSMastBackSlot ? <window.BSMastBackSlot /> : null}
            {BSLogo ? <BSLogo size={16} color={t.INK} /> : null}
          </div>
          {corner}
        </div>
        {BSBackRow ? <BSBackRow onBack={onBack} trailing={<span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: D.text.teal, whiteSpace: 'nowrap' }}>{tr('marketplace:dir.eyebrow', { defaultValue: 'The classifieds' })}</span>} /> : null}
        <h1 style={{ margin: '6px 0 0', fontFamily: t.DISPLAY, fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.02, color: t.INK }}>
          {tr('marketplace:dir.title1', { defaultValue: 'Find your' })} <span style={{ color: D.mark.teal }}>{tr('marketplace:dir.title2', { defaultValue: 'coach.' })}</span>
        </h1>
      </div>

      <div data-mkt-dir="" style={{ padding: `16px ${t.padX}px 0` }}>
        <style>{MKT_DIR_CSS(D.mark.teal, t.INK70)}</style>
        <MktDirSearch value={query} onChange={onQuery} />
        <div style={{ marginTop: 10 }}>
          <MktDirSwitch tabs label={tr('marketplace:dir.filterAria', { defaultValue: 'Filter coaches by role' })}
            options={['All', 'Trainers', 'Nutritionists'].map((p) => [p, roleTab(p)])}
            value={forceList && pill === 'All' ? null : pill} onChange={onPill} />
        </div>

        {/* A role's filters: one row of chips, wrapping when a language runs long. */}
        {filters ? (
          <div data-mkt-filters="" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }}>
            <MktDirChip value={filters.cat} onChange={filters.onCat}
              options={(filters.cats || []).map((c, i) => [c, i === 0 ? tr('marketplace:filter.allCategories', { defaultValue: 'All categories' }) : c])} />
            {filters.format != null ? (
              <MktDirChip value={filters.format} onChange={filters.onFormat} options={(filters.formats || []).map((f) => [f, formatWord(f)])} />
            ) : null}
            <MktDirChip value={filters.loc} onChange={filters.onLoc} options={(filters.locs || []).map((l) => [l, l])}
              label={tr('settings:edit.location', { defaultValue: 'Location' })} />
            {clearFilters}
          </div>
        ) : null}

        {(loading || error) ? (
          <div data-mkt-status="" style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: error ? t.RUST : t.INK70, fontWeight: 700 }}>
            {loading ? tr('marketplace:dir.syncingProviders', { defaultValue: 'Syncing live providers…' }) : tr('marketplace:dir.demoData', { defaultValue: 'Demo data · {error}', error })}
          </div>
        ) : null}

        {deepMiss ? (
          <div role="status" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center', border: `1px solid ${t.AMBER}66`, borderRadius: 14, background: `${t.AMBER}12`, padding: '4px 4px 4px 14px' }}>
            <span style={{ flex: 1, padding: '8px 0', fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK }}>{tr('marketplace:dir.coachNotOpen', { defaultValue: "That coach's listing isn't open yet. They'll appear here once it is." })}</span>
            <button type="button" onClick={onDeepMissDismiss} aria-label={tr('marketplace:dir.coachNotOpenDismiss', { defaultValue: 'Dismiss' })} style={{ flex: 'none', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: t.INK70 }}>×</button>
          </div>
        ) : null}

        {browsing ? (
          <div data-mkt-list="" style={{ marginTop: 18 }}>
            {/* The sort orders the list, so it sits on the list's own head (a role's list only, as before). */}
            <MktDirSection kicker={listKicker} title={tr('marketplace:dir.onTheBooks', { defaultValue: '{count} on the books', count: list.length })}
              aside={filters ? (
                <MktDirChip value={filters.sort} onChange={filters.onSort} options={(filters.sorts || []).map((s) => [s, sortWord(s)])} glyph="↕"
                  label={tr('coach:head.sortBy', { defaultValue: 'Sort: {mode}', mode: sortWord(filters.sort) })} />
              ) : null} />
            {/* The list as tall cards, two across (the owner's A, 2026-11-04); a miss is one raised card. */}
            <div data-mkt-cards="" style={list.length ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 } : group}>
              {list.map((c) => <MktDirRow key={c.key} card={c} perMonth={perMonth} />)}
              {list.length === 0 ? (
                <div data-mkt-empty="" style={empty}>
                  {tr('marketplace:dir.noMatch', { defaultValue: 'No coaches match that — try a different filter.' })}
                  {clearFilters ? <div style={{ marginTop: 4, marginLeft: -4 }}>{clearFilters}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {feature ? <div style={{ marginTop: 18 }}><MktDirFeature feature={feature} /></div> : null}

            <div data-mkt-roster="" style={{ marginTop: 28 }}>
              <MktDirSection kicker={tr('marketplace:dir.rosterKicker', { defaultValue: 'On the roster' })} title={tr('marketplace:dir.thisWeek', { defaultValue: 'This week' })}
                action={tr('marketplace:dir.seeAll', { defaultValue: 'See all' })} onAction={onSeeAll} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {roster.map((c) => <MktDirTile key={c.key} card={c} perMonth={perMonth} />)}
              </div>
            </div>

            {/* What's hot: published plans across coaches, one kind at a time. */}
            <div data-mkt-plans="" style={{ marginTop: 28 }}>
              <MktDirSection kicker={tr('marketplace:dir.fromCoaches', { defaultValue: 'From coaches' })} title={tr('marketplace:dir.whatsHot', { defaultValue: "What's hot" })} />
              <MktDirSwitch label={tr('marketplace:dir.whatsHot', { defaultValue: "What's hot" })} options={planTabs.map(([k, l]) => [k, l])} value={planTab} onChange={onPlanTab} />
              <div style={{ ...group, marginTop: 10 }}>
                {plans.length === 0 ? (
                  <div style={empty}>{tr('marketplace:dir.noPlansYet', { defaultValue: 'No {label} listed yet — check back soon.', label: (planTabs.find(([k]) => k === planTab) || [])[2] || '' })}</div>
                ) : plans.map((pl, i) => <MktDirPlanRow key={pl.key} plan={pl} n={i + 1} first={i === 0} />)}
              </div>
            </div>

            {/* The Apply doors, for coaches: the discovery view only. */}
            <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <MktDirApply nutri={false} onApply={() => onApply('trainer')} />
              <MktDirApply nutri onApply={() => onApply('nutritionist')} />
            </div>
          </>
        )}
      </div>

      <BSFooter right={tr('marketplace:footer.marketplace', { defaultValue: 'Marketplace' })} />
    </BSPage>
  );
}
