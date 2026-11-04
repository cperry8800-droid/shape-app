import React from 'react';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS } from './bsCleanType.jsx';
// ─── THE MEMBER PROFILE'S TILES (option C, "Bento") ──────────────────────────────────────────────
// Owner, 2026-11-04, of the member profile: "hate the look of this on client profile, need this to look
// less analog and boring", and of the three designs that followed, "go with c but dont change the look or
// design of followers, following part. leave that as is. and dont forget to keep the currect activity feed
// look the same as well". So the counts line and the activity cards under the Activity tab are as they
// were; the actions, the coach, the tab row, the photos and the shelf are rounded tiles.
//
// What BSTerrainProfile (iosAppBroadsheetClient.jsx) draws from here: the line icons, a tile's surface,
// the lit tile's look, the photo mosaic and the shelf's award cards. Everything comes in as props (the
// theme, the ink, the tier's colour, the words already translated), so this module imports nothing from
// the client module and reads no window global.

// The client's bsTHexA, copied rather than imported: a feature module never imports back into the client.
const hexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// The teal the app uses for the tier's ring and the coach's ring, on either paper (WORKLOG: Theme).
const bsMpTeal = (t) => (t && t.isLight ? '#0a8f87' : '#34d6c5');

// Line icons, monochrome and drawn in currentColor, so they take the ink or the tier's colour (no
// coloured emoji in new work).
const BS_MP_ICON_PATHS = {
  trophy: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'],
  award: ['M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z', 'M15.48 12.89 17 22l-5-3-5 3 1.52-9.11'],
  chevron: ['m9 6 6 6-6 6'],
  pencil: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M20 6 9 17l-5-5'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 2'],
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z'],
  pulse: ['M3 12h4l3-8 4 16 3-8h4'],
  wave: ['M3 17V9', 'M8 17V5', 'M13 17v-6', 'M18 17V8', 'M3 21h18'],
  peak: ['m3 20 6-10 4 6 3-4 5 8Z', 'M9 10V4l4 2-4 2'],
  note: ['M9 18V5l11-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', 'M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  spark: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'm5.6 5.6 2.8 2.8', 'm15.6 15.6 2.8 2.8', 'm5.6 18.4 2.8-2.8', 'm15.6 8.4 2.8-2.8'],
};
export function BSMpIcon({ name, size = 16, stroke = 2, style = null }) {
  const paths = BS_MP_ICON_PATHS[name] || BS_MP_ICON_PATHS.spark;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none', ...(style || {}) }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// A tile: a quiet rounded surface, white light over a light paper and the ink's own tint over a dark one.
export function bsMpTile(t, INK) {
  const light = !!(t && t.isLight);
  return { borderRadius: 20, background: light ? 'rgba(255,255,255,0.76)' : hexA(INK, 0.065), border: `1px solid ${hexA(INK, light ? 0.07 : 0.09)}`, boxShadow: light ? '0 1px 2px rgba(15,14,12,0.05)' : 'none', boxSizing: 'border-box' };
}

// The sheen laid over the tier's colour on the one lit tile. It sits in backgroundImage, over a solid
// background colour, so the words the client picks to read on that colour (bsReadableOn) still read.
export const BS_MP_SHEEN = 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.10) 100%)';

// An action tile: its icon in a rounded square beside its words, one condensed row (owner, 2026-11-04:
// "condense these"). `lit` is the one thing to press (Log activity, or Follow on someone else's page) in
// the tier's colour; the rest are quiet tiles. `compact` is the narrow tile (Edit profile beside Log
// activity): smaller words that may wrap, hyphenated in a long language.
export function bsMpAction({ t, INK, c, onC, lit = false, compact = false }) {
  const base = {
    minWidth: 0, padding: compact ? '8px 10px' : '8px 12px', borderRadius: 18, display: 'flex', flexDirection: 'row',
    justifyContent: 'flex-start', alignItems: 'center', gap: compact ? 8 : 10, textAlign: 'left',
    fontFamily: BS_CLEAN_HEAD, fontSize: compact ? 13 : 16, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15,
    overflowWrap: 'anywhere', hyphens: 'auto', cursor: 'pointer', boxSizing: 'border-box',
  };
  return lit
    ? { ...base, border: 0, background: c, backgroundImage: BS_MP_SHEEN, boxShadow: `0 10px 22px -6px ${hexA(c, 0.42)}`, color: onC }
    : { ...base, ...bsMpTile(t, INK), borderRadius: 18, color: INK };
}
// The action tile's icon square, tinted from the words' own colour.
export function BSMpIconBox({ name, ink, size = 30 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: Math.round(size / 3), flex: 'none', display: 'grid', placeItems: 'center', background: hexA(ink, 0.12) }}>
      <BSMpIcon name={name} size={Math.round(size * 0.5)} stroke={2.3} />
    </span>
  );
}

// The photos as a mosaic: the newest a big tile, the next two stacked beside it, any more in rows of
// three, the last one widening to close its row; two share a row and one runs wide. Each opens full size
// (`onOpen(i)`, the client's BSPhotoViewer). `inset` lines the mosaic up with the page's gutter.
export function BSMemberWallMosaic({ wall, onOpen, shotLabel, label, INK, t, inset = 0 }) {
  const n = wall.length;
  const cols = n >= 3 ? 3 : n;
  const extra = n - 3;
  return (
    <div role="group" aria-label={label} data-member-wall=""
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: n >= 3 ? 116 : (n === 2 ? 200 : 216), gap: 8, padding: `0 ${inset}px` }}>
      {wall.map((w, i) => {
        const big = n >= 3 && i === 0;
        const last = i === n - 1 && extra > 0;
        const span = big ? 'span 2' : last && extra % 3 === 1 ? 'span 3' : last && extra % 3 === 2 ? 'span 2' : 'auto';
        return (
          <figure key={i} style={{ position: 'relative', margin: 0, gridColumn: span, gridRow: big ? 'span 2' : 'auto', borderRadius: big ? 22 : 18, overflow: 'hidden', background: hexA(INK, 0.06), boxShadow: t && t.isLight ? '0 6px 18px rgba(15,14,12,0.10)' : 'none' }}>
            <button type="button" data-bs-wall-shot="" onClick={() => onOpen(i)} aria-label={shotLabel(i)}
              style={{ display: 'block', width: '100%', height: '100%', padding: 0, border: 0, cursor: 'zoom-in', background: `center/cover no-repeat url("${w.url}")` }} />
            {w.caption ? (
              <figcaption style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: big ? '44px 14px 13px' : '28px 10px 9px', pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)' }}>
                <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: '#ffffff', fontFamily: BS_CLEAN_HEAD, fontSize: big ? 16 : 12, fontWeight: 650, lineHeight: 1.2, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>{w.caption}</span>
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

// The shelf as award cards that fit the screen, with no sideways scroll (owner, 2026-11-04: "make items
// on the shelf fit on page, no side scrolling"). Three moments stand three across, each a medal over its
// title and the date on a chip; one, two or four (the shelf holds four at most, BS_SHELF_MAX) lie flat,
// the medal beside the words, one or two to a row. The proudest's medal is lit in the tier's colour with
// its ring running to teal. `head` is "The shelf · Proudest": the part before " · " is the head, the rest
// its quiet note. `bleed` is how far the tab's body sits in from the screen's edge and `gut` the page's
// gutter, so the cards line up with the gutter.
export function BSMemberShelfCards({ shelf, head, INK, c, onC, t, bleed = 0, gut = 22 }) {
  const [headMain, ...headRest] = String(head || '').split(' · ');
  const inset = Math.max(0, gut - bleed);
  const tile = bsMpTile(t, INK), teal = bsMpTeal(t);
  const n = shelf.length;
  const upright = n === 3;
  const cols = upright ? 3 : Math.min(Math.max(n, 1), 2);
  const medal = (i, size) => (
    <span aria-hidden="true" style={{ flex: 'none', width: size, height: size, borderRadius: 99, padding: 2, boxSizing: 'border-box', background: i === 0 ? `conic-gradient(from 200deg, ${c}, ${teal}, ${c})` : `conic-gradient(from 200deg, ${hexA(INK, 0.38)}, ${hexA(INK, 0.1)}, ${hexA(INK, 0.38)})` }}>
      <span style={{ width: '100%', height: '100%', borderRadius: 99, display: 'grid', placeItems: 'center', boxSizing: 'border-box', border: `2px solid ${t && t.isLight ? '#ffffff' : (t && t.PAPER) || '#000000'}`, background: i === 0 ? c : (t && t.PAPER2) || hexA(INK, 0.08), backgroundImage: i === 0 ? BS_MP_SHEEN : 'none', color: i === 0 ? onC : hexA(INK, 0.8) }}>
        <BSMpIcon name={i === 0 ? 'trophy' : 'award'} size={Math.round(size * 0.4)} stroke={2} />
      </span>
    </span>
  );
  const title = (s) => <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: BS_CLEAN_HEAD, fontSize: 12.5, fontWeight: 650, lineHeight: 1.22, color: INK, overflowWrap: 'anywhere' }}>{s.title}</span>;
  // The date is the member's own words (up to 20 characters, "September 2026"), so its chip stays inside a
  // third of a narrow phone: no wider than its card, wrapping rather than running into the next one
  // (Codex P2 on #2585).
  const when = (s) => (s.when ? <span data-shelf-when="" style={{ alignSelf: upright ? 'center' : 'flex-start', maxWidth: '100%', boxSizing: 'border-box', padding: '2px 7px', borderRadius: 10, background: (t && t.SURFACE_STRONG) || hexA(INK, 0.08), fontFamily: BS_CLEAN_SANS, fontSize: 10.5, fontWeight: 600, lineHeight: 1.3, color: hexA(INK, 0.66), fontVariantNumeric: 'tabular-nums', whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: upright ? 'center' : 'left' }}>{s.when}</span> : null);
  return (
    <div style={{ paddingTop: 8 }}>
      <span data-shelf-head="clean" style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: `0 ${inset}px 10px` }}>
        <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: INK }}>{headMain}</span>
        {headRest.length ? <span style={{ fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 500, color: hexA(INK, 0.56) }}>{headRest.join(' · ')}</span> : null}
      </span>
      <div data-member-shelf="" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8, padding: `0 ${inset}px` }}>
        {shelf.map((s, i) => (upright ? (
          <div key={i} style={{ ...tile, borderRadius: 16, minWidth: 0, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            {medal(i, 46)}{title(s)}{when(s)}
          </div>
        ) : (
          <div key={i} style={{ ...tile, borderRadius: 16, minWidth: 0, padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
            {medal(i, 40)}
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>{title(s)}{when(s)}</span>
          </div>
        )))}
      </div>
    </div>
  );
}

// The coach's ring: the coach's own colour (nutritionists gold, trainers rust) running to teal.
export const bsMpCoachRing = (t, role) => {
  const roleC = role === 'nutritionist' ? '#a07a2e' : '#c0533b';
  return `conic-gradient(from 200deg, ${roleC}, ${bsMpTeal(t)}, ${roleC})`;
};
