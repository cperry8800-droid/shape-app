import React from 'react';
import { bsSdSplitUnit } from '../services/sessionLedger.mjs';
// ─── THE WALL · A STORY ──────────────────────────────────────────────────────────────────────────
// Owner, 2026-10-23: the dark magazine look for the Wall, its headlines in Oswald ("use oswald"), and
// "keep the same likes and comments". A post on the Wall reads as a story: a picture or its route with
// the headline over it (or the headline alone), the byline, then what the post is about: three
// figures, or a record's one big number, and the coach's line pulled out when a coach co-signed it.
// BSActivityCard (variant "magazine") draws these at the top of the card and keeps everything under
// them as it was: the plate, the appointments, the co-sign, the reactions, the faces and the comments.
// Window globals are read at call time and the module never imports back into the client module (the
// BSIntegrationsPage / BSLeaderboard pattern); the card passes its avatar and handlers in.

// The kicker over a picture: a warm tint that reads on any photo or the route's dark ground.
const BS_WS_OVER_KICKER = '#ffb39f';
// The magazine's red and its headline face, shared with the chat page's header (owner, 2026-10-24: the
// header above the Wall "to match the new feed wall look").
export const bsWsRed = (t) => (t.isLight ? '#b23a1f' : '#ff7a5c');
export const bsWsHead = (t) => t.HEADLINE || t.DISPLAY;


function BSWsKicker({ children, color }) {
  const t = window.useBS();
  return <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>;
}

// Headlines a step down (owner, 2026-10-23: "dont make the font so tall … on the headers"): Oswald at
// 22–23 px and 600 rather than 28–29 and 700, opened a touch, so a capital reads less tall and thin.
function BSWsHeadline({ children, color, size }) {
  const t = window.useBS();
  return <h3 style={{ margin: 0, fontFamily: bsWsHead(t), fontWeight: 600, fontSize: size, lineHeight: 1.04, letterSpacing: '0.012em', textTransform: 'uppercase', color, textWrap: 'balance', overflowWrap: 'anywhere' }}>{children}</h3>;
}

// The route as the picture: the stored line (0..100 on both axes) across the top of a dark ground, so
// the headline under it never sits on the line. The line stretches to the picture; the start and end
// marks are drawn apart from it so they stay round.
function BSWsRoute({ points }) {
  const pts = points.map(([x, y]) => `${x},${y}`).join(' ');
  const at = ([x, y]) => ({ left: `${((x + 4) / 108) * 100}%`, top: `${((y + 6) / 112) * 100}%` });
  const dot = { position: 'absolute', borderRadius: '50%', transform: 'translate(-50%, -50%)' };
  return (
    <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '62%' }}>
      <svg viewBox="-4 -6 108 112" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <polyline points={pts} fill="none" stroke="rgba(255,179,159,0.22)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polyline points={pts} fill="none" stroke={BS_WS_OVER_KICKER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span style={{ ...dot, ...at(points[0]), width: 9, height: 9, background: '#18231f', boxShadow: `inset 0 0 0 2px ${BS_WS_OVER_KICKER}` }} />
      <span style={{ ...dot, ...at(points[points.length - 1]), width: 10, height: 10, background: BS_WS_OVER_KICKER }} />
    </div>
  );
}

// The head of a story. `photo` (a URL) or `route` ({ points }) makes the picture, the headline over
// its foot; with neither the kicker and headline stand alone. `bleed` is the card's side gutter, which
// the picture runs past to the screen edge. `onOpen` opens the full activity; the byline's `onAuthor`
// opens the profile. On a profile (no `name`: the page is already theirs) the byline is just `meta`.
// `action` sits at the byline's right end (the owner's edit on their own profile).
export function BSWallStoryHead({ kicker, title, photo = null, route = null, avatar = null, name, meta = '', bleed = 12, onOpen, onAuthor, action = null }) {
  const t = window.useBS();
  const pic = photo || (route && Array.isArray(route.points) && route.points.length >= 2 ? route : null);
  return (
    <div data-bs-wall-story="" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pic ? (
        <div data-bs-wall-story-pic="" role="button" tabIndex={0} onClick={onOpen}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }}
          style={{ position: 'relative', height: 240, margin: `0 -${bleed}px`, overflow: 'hidden', cursor: 'pointer',
            background: photo ? '#1c1a16' : '#18231f',
            backgroundImage: photo ? 'none' : 'linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)',
            backgroundSize: '26px 26px' }}>
          {photo ? <img src={photo} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <BSWsRoute points={route.points} />}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `56px ${bleed + 6}px 14px`, background: 'linear-gradient(rgba(10,9,8,0), rgba(10,9,8,0.86) 62%)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {kicker ? <BSWsKicker color={BS_WS_OVER_KICKER}>{kicker}</BSWsKicker> : null}
            <BSWsHeadline color="#fff" size={23}>{title}</BSWsHeadline>
          </div>
        </div>
      ) : (
        <div role="button" tabIndex={0} onClick={onOpen}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(); } }}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', paddingTop: 4 }}>
          {kicker ? <BSWsKicker color={bsWsRed(t)}>{kicker}</BSWsKicker> : null}
          <BSWsHeadline color={t.INK} size={22}>{title}</BSWsHeadline>
        </div>
      )}
      <div data-bs-wall-story-byline="" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, margin: '-8px 0' }}>
        {name ? (
          <button type="button" onClick={onAuthor} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, minWidth: 0, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit' }}>
            {avatar}
            <span style={{ minWidth: 0, fontFamily: t.BODY, fontSize: 13, color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <b style={{ color: t.INK, fontWeight: 600 }}>{name}</b>{meta ? ` · ${meta}` : ''}
            </span>
          </button>
        ) : (
          <span style={{ minWidth: 0, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</span>
        )}
        {action ? <span style={{ marginLeft: 'auto', flex: 'none', display: 'inline-flex' }}>{action}</span> : null}
      </div>
    </div>
  );
}

// Up to three figures ([label, value]), each in its own column, a rule between them.
export function BSWallStoryFigures({ items = [] }) {
  const t = window.useBS();
  const shown = items.filter((r) => r && r[0] && r[1] != null && String(r[1]).trim() !== '').slice(0, 3);
  if (!shown.length) return null;
  return (
    <div data-bs-wall-story-figs="" style={{ display: 'grid', gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))`, borderTop: `1px solid ${t.HAIR}` }}>
      {shown.map(([k, v], i) => (
        <div key={`${k}-${i}`} style={{ minWidth: 0, paddingTop: 9, ...(i ? { paddingLeft: 12, borderLeft: `1px solid ${t.HAIR}` } : null) }}>
          <div style={{ fontFamily: bsWsHead(t), fontSize: 26, fontWeight: 600, lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</div>
        </div>
      ))}
    </div>
  );
}

// A record's one number: the figure in Oswald, its unit beside it, then how far past the old best.
// 48 px, not the board's 84 (owner, 2026-10-23: "this doesnt need to be so big").
export function BSWallStoryRecord({ value, best = null }) {
  const t = window.useBS();
  const u = bsSdSplitUnit(value);
  if (!u.num) return null;
  return (
    <div data-bs-wall-story-record="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: bsWsHead(t), fontWeight: 600, lineHeight: 0.9, color: t.INK }}>
        <span style={{ fontSize: 48, letterSpacing: '0.005em', fontVariantNumeric: 'tabular-nums' }}>{u.num}</span>
        {u.unit ? <span style={{ fontSize: 16, color: t.INK50, textTransform: 'uppercase' }}>{u.unit}</span> : null}
      </div>
      {best ? <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.isLight ? '#2d6a3e' : '#7fd18f' }}>{best}</span> : null}
    </div>
  );
}

// The coach's line, pulled out: the quote mark, their words, then who and how (co-signed · Coach).
export function BSWallStoryQuote({ text, cite, onOpen }) {
  const t = window.useBS();
  if (!text) return null;
  return (
    <button type="button" data-bs-wall-story-quote="" onClick={onOpen} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: 6, width: '100%', padding: '12px 0 2px', margin: 0, border: 0, borderTop: `1px solid ${t.HAIR}`, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
      <span aria-hidden style={{ fontFamily: bsWsHead(t), fontSize: 42, fontWeight: 700, lineHeight: 0.7, color: bsWsRed(t) }}>“</span>
      <span style={{ fontFamily: bsWsHead(t), fontSize: 21, fontWeight: 500, lineHeight: 1.15, color: t.INK }}>{text}</span>
      <span style={{ gridColumn: 2, marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{cite}</span>
    </button>
  );
}

// The Wall's masthead: "The Wall" in Oswald over a heavy rule, the dateline (the day, and how many are
// training when anyone is), then the activity types as text tabs with a red underline, spread across
// the column and scrolling sideways when a language's words run longer. `types` are [key, label] pairs;
// `type` is the one shown. It sits on the cards' 12px gutter, as the live story does.
export function BSWallMasthead({ title, dateline, trainingLine = null, types = [], typesLabel, type, onType }) {
  const t = window.useBS();
  const red = bsWsRed(t);
  const mono = { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' };
  return (
    <header data-bs-wall-masthead="" style={{ margin: '0 12px' }}>
      <h2 style={{ margin: 0, padding: '6px 0 8px', borderBottom: `3px solid ${t.INK}`, fontFamily: bsWsHead(t), fontSize: 30, fontWeight: 600, lineHeight: 0.95, letterSpacing: '0.012em', textTransform: 'uppercase', color: t.INK }}>{title}</h2>
      <div style={{ ...mono, fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: `1px solid ${t.HAIR}`, color: t.INK50 }}>
        <span>{dateline}</span>
        {trainingLine ? <span style={{ color: red, textAlign: 'right' }}>{trainingLine}</span> : null}
      </div>
      <nav className="bs-hide-scroll" aria-label={typesLabel || title} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, overflowX: 'auto', borderBottom: `1px solid ${t.HAIR}` }}>
        {types.map(([k, label]) => {
          const on = k === type;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onType && onType(k)}
              style={{ ...mono, flex: 'none', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', color: on ? t.INK : t.INK50, boxShadow: on ? `inset 0 -2px 0 ${red}` : 'none' }}>
              {label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
