import React from 'react';
import { bsWsAccent, bsWsHexA } from './bsMagazine.mjs';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType, useBSClean } from './bsCleanType.jsx';
// ─── THE TOP OF THE WALL ─────────────────────────────────────────────────────────────────────────
// The lens (Universal / Following), how many are online, the online rail with its Hide and Show, and the
// type chips, moved out of iosAppBroadsheetClient.jsx and redrawn as the owner's B (2026-11-04: "go with
// B for the wall", of three looks drawn for "new other design options for this section"), with their
// rules for it: "keep designs simple … modern, appealing, easy to navigate, not overwhelming, not
// analog", the member profile's look ("this looks better"), "make sure you have the facet avatar", and
// "reduce the coloring and simplify UI more". So, top to bottom:
//   · the lens as the profile's tab row, an icon over its word, the lens shown in ink over a short teal bar;
//   · how many are online, by a live dot, with Hide at the row's end (Show, once hidden);
//   · each person online on a small card of their own (the profile shelf's), in the paper's own colour
//     with a soft shadow: their face, their first name, and what they are doing (training, cooking or
//     online), small enough that four and more fit across (owner, 2026-11-04: "reduce the size of these
//     individual boxes are online members");
//   · the types in one rounded track, the type shown a flat teal pill.
// Colour is a signal only: the live dot, the ring on a face mid-activity, a coach's ring, the lens shown
// and the type shown. No tinted panel, no gradient, no glow round a chip.
// A member is the facet and a coach a circle in a ring of the coach's colour (owner, 2026-11-04: "keep the
// facet avatars for clients and circle avatar for coaches"): the client draws the faces (`face`), so that
// rule stays where BSFacetAvatar and BSRailCoachFace live.
//
// ⚠ THE CLIENT KEEPS THE DATA AND THE DOORS. Who is online (real when signed in, the sample signed out),
// the count, the lens and its persistence, the type, the rail's Hide / Show and their persistence, and
// what a face opens are all the client's, handed in; nothing here reads or writes any of them.
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP, and this module never imports the client
// module (the BSLeaderboard / BSEatDay pattern).
// ⚠ NOTHING MOVES FOR A READER WHO ASKED FOR LESS MOTION: every resting style is the finished state, and
// the sheet below switches every animation and transition off under prefers-reduced-motion.

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

const hexA = bsWsHexA;
const inkA = (t, a) => hexA(t.INK, a);
// The signals' colours: the teal (the deeper one on light paper, which small marks need), the amber of a
// meal on the stove.
const tealOf = (t) => (t.isLight ? '#0a8f87' : '#34d6c5');
const amberOf = (t) => t.AMBER || '#d8a23a';
const isCoach = (p) => !!p && (p.role === 'trainer' || p.role === 'nutritionist');
const firstName = (p) => String((p && p.name) || '').split(' ')[0];
// What a person is doing, as the rail's dot already says it: in a workout (teal), at the stove (amber), or
// online (no colour).
const activityOf = (t, p) => (p && p.activity === 'workout' ? tealOf(t) : p && p.activity === 'cooking' ? amberOf(t) : null);
// The type shown: a flat teal pill, its words dark on the bright teal (dark paper, 10:1) and white on the
// deeper one (light paper, 5.3:1).
export const bsWallLit = (t) => (t.isLight ? { background: '#0a7a72', color: '#ffffff' } : { background: '#34d6c5', color: '#06110e' });
// A card or the track: the paper's own colour, a hairline, and a soft shadow under it.
export const bsWallRaised = (t, radius = 18) => ({
  background: t.PAPER, borderRadius: radius, border: `1px solid ${inkA(t, t.isLight ? 0.08 : 0.1)}`, boxSizing: 'border-box',
  boxShadow: t.isLight
    ? '0 1px 2px rgba(15,14,12,0.06), 0 12px 24px -16px rgba(15,14,12,0.32)'
    : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.45), 0 14px 26px -16px rgba(0,0,0,0.9)',
});

const BS_WT_CSS = `
@keyframes bswt-in { from { opacity: 0; transform: translateY(8px); } }
@keyframes bswt-ping { 0% { transform: scale(1); opacity: 0.6; } 75%, 100% { transform: scale(2.6); opacity: 0; } }
@keyframes bswt-ring { 0%, 100% { opacity: 0.95; } 50% { opacity: 0.35; } }
[data-bs-wall-top] button { -webkit-tap-highlight-color: transparent; }
[data-bs-wall-top] button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 14px; }
[data-bs-wall-top] [data-bs-wall-face] { transition: transform 200ms cubic-bezier(.2,.8,.2,1); }
[data-bs-wall-top] [data-bs-wall-face]:active { transform: translateY(-3px); }
@media (hover: hover) { [data-bs-wall-top] [data-bs-wall-face]:hover { transform: translateY(-2px); } }
[data-bs-wall-top] [data-bswt-scroll] { scrollbar-width: none; }
[data-bs-wall-top] [data-bswt-scroll]::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) {
  [data-bs-wall-top] *, [data-bs-wall-top] *::before, [data-bs-wall-top] *::after { animation: none !important; transition: none !important; }
  [data-bs-wall-top] [data-bs-wall-face]:active, [data-bs-wall-top] [data-bs-wall-face]:hover { transform: none !important; }
}
`;

// Line icons in currentColor (no coloured emoji): the world for Universal, two people for Following.
const BS_WT_ICONS = {
  universal: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z'],
  following: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
};
function BSWtIcon({ name, size = 16, stroke = 2 }) {
  const paths = BS_WT_ICONS[name] || BS_WT_ICONS.universal;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// The live dot: a still teal dot and a ring that keeps leaving it (the ring stops under reduced motion;
// the dot stays). Once the rail is hidden it is a still grey dot.
function BSWtLiveDot({ c, still = false }) {
  return (
    <span aria-hidden="true" data-bs-wall-dot={still ? 'still' : 'live'} style={{ position: 'relative', flex: 'none', display: 'inline-block', width: 8, height: 8 }}>
      {!still && <span style={{ position: 'absolute', inset: 0, borderRadius: 99, background: c, animation: 'bswt-ping 2.4s cubic-bezier(0,0,.2,1) infinite' }} />}
      <span style={{ position: 'absolute', inset: 0, borderRadius: 99, background: c }} />
    </span>
  );
}

// The lens as the profile's tab row: an icon over its word, the lens shown in ink (its icon in the teal)
// over a short teal bar, the other quiet.
function BSWallLens({ t, lenses, mode, onMode }) {
  return (
    <div data-bs-wall-lens="" style={{ display: 'grid', gridTemplateColumns: `repeat(${lenses.length || 1}, minmax(0, 1fr))`, margin: '0 12px', borderBottom: `1px solid ${inkA(t, t.isLight ? 0.1 : 0.12)}` }}>
      {lenses.map(([k, label]) => {
        const on = mode === k;
        return (
          <button key={k} type="button" onClick={() => onMode(k)} aria-pressed={on}
            style={{ position: 'relative', minWidth: 0, minHeight: 56, padding: '6px 4px 8px', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: on ? t.INK : inkA(t, 0.5) }}>
            <span style={{ color: on ? bsWsAccent(t) : 'inherit', display: 'grid', placeItems: 'center' }}><BSWtIcon name={k} size={19} stroke={2} /></span>
            <span style={{ maxWidth: '100%', fontFamily: BS_CLEAN_HEAD, fontSize: 13.5, fontWeight: on ? 700 : 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            <span aria-hidden="true" data-bs-wall-lens-bar="" style={{ position: 'absolute', left: '50%', bottom: -1, width: 28, marginLeft: -14, height: 2.5, borderRadius: 2, background: tealOf(t), opacity: on ? 1 : 0, transition: 'opacity 200ms ease' }} />
          </button>
        );
      })}
    </div>
  );
}

// A quiet word button at a row's end, in a 44px target: Hide (ink) and Show (the teal).
function BSWtRowButton({ t, onClick, aria, label, icon, tone = 'quiet' }) {
  return (
    <button type="button" onClick={onClick} aria-label={aria}
      style={{ flex: 'none', minHeight: 44, minWidth: 44, padding: '0 4px 0 12px', border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: tone === 'teal' ? bsWsAccent(t) : inkA(t, 0.56) }}>
      {label}<BSWtIcon name={icon} size={13} stroke={2.4} />
    </button>
  );
}

// A face on its card: the client's face (a facet for a member, a ringed circle for a coach) standing a
// little off the card on a soft shadow, and, while the person is mid-activity, a ring of the facet's or the
// circle's own shape in the activity's colour, breathing.
const FACE_BOX = 36;
const FACE_COACH = 42;
function BSWtFace({ t, person, face }) {
  const coach = isCoach(person);
  const act = activityOf(t, person);
  const ring = coach ? FACE_COACH + 8 : FACE_BOX + 8;
  return (
    <span style={{ position: 'relative', width: 52, height: 52, display: 'grid', placeItems: 'center' }}>
      {act ? (
        <span aria-hidden="true" data-bs-wall-ring={coach ? 'circle' : 'facet'} style={{ position: 'absolute', left: '50%', top: '50%', width: ring, height: ring, marginLeft: -ring / 2, marginTop: -ring / 2, boxSizing: 'border-box', border: `2px solid ${act}`, borderRadius: coach ? '50%' : '30%', transform: coach ? 'none' : 'rotate(45deg)', animation: 'bswt-ring 2.6s ease-in-out infinite' }} />
      ) : null}
      <span style={{ position: 'relative', display: 'grid', placeItems: 'center', filter: t.isLight ? 'drop-shadow(0 4px 5px rgba(15,14,12,0.2))' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.55))' }}>
        {face(person, { size: FACE_COACH, box: FACE_BOX })}
      </span>
    </span>
  );
}

// What a person online is doing, as a word under their name with its dot.
function bsWtStatus(t, tr, person) {
  if (person.activity === 'workout') return { c: tealOf(t), label: tr('feed:rail.statusTraining', { defaultValue: 'Training' }) };
  if (person.activity === 'cooking') return { c: amberOf(t), label: tr('feed:rail.statusCooking', { defaultValue: 'Cooking' }) };
  return { c: null, label: tr('feed:rail.statusOnline', { defaultValue: 'Online' }) };
}

// The types in one rounded track, the type shown a flat teal pill in it.
function BSWallTypeTrack({ t, types, type, onType, typesLabel }) {
  return (
    <div style={{ ...bsWallRaised(t, 999), margin: '0 12px', overflow: 'hidden' }}>
      <nav data-bs-wall-types="" data-bswt-scroll="" aria-label={typesLabel} style={{ display: 'flex', gap: 2, overflowX: 'auto', padding: '0 3px' }}>
        {types.map(([k, label]) => {
          const on = k === type;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onType && onType(k)}
              style={{ flex: 'none', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              <span data-lit={on ? 'on' : 'off'} style={{ height: 36, padding: '0 14px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box', fontFamily: BS_CLEAN_HEAD, fontSize: 13.5, fontWeight: on ? 700 : 600, letterSpacing: '-0.005em', whiteSpace: 'nowrap',
                ...(on ? bsWallLit(t) : { background: 'transparent', color: inkA(t, 0.66) }) }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ── The top of the Wall ──────────────────────────────────────────────────────────────────────────
// `wall` is true on the Wall itself: the lens and the types are the Wall's, so on Chat's other places only
// the people online show. `people` are the rail's people (real ones signed in, the sample signed out);
// `count` how many are online; `face(person, { size, box })` draws a face (the client's facet or ringed
// circle); `onFace(person)` opens the person; `onHide` / `onShow` hide and bring back the rail; `lenses`
// are [key, label] pairs with `mode` the lens shown and `onMode` the switch; `types` / `type` / `onType` /
// `typesLabel` the type filter.
//
// The rail is gated as it always was: the cards when railOn and someone is online, the count with Show
// when !railOn and someone is online, and nothing of the rail when nobody is (a signed-in member with no
// one active sees no rail: never fabricated people). Neither Hide nor Show is gated on sign-in (owner
// call, 2026-08-27: the preview is where the rail is reachable at all).
export function BSWallTop(props) {
  const p = { people: [], lenses: [], types: [], ...props };
  const t = useBSClean();
  const tr = useShapeTr();
  const INK = t.INK;
  const has = p.people.length > 0;
  const count = tr('feed:rail.onlineNow', { defaultValue: '{count, number} online now', count: p.count });
  return (
    <BSCleanType t={t}>
      <style>{BS_WT_CSS}</style>
      <section data-bs-wall-top="" style={{ marginBottom: p.wall ? -8 : 0 }}>
        {p.wall && <BSWallLens t={t} lenses={p.lenses} mode={p.mode} onMode={p.onMode} />}
        {p.railOn && has && (
          <div data-bs-wall-online="on" style={{ paddingTop: p.wall ? 8 : 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px 0 16px', minHeight: 44 }}>
              <BSWtLiveDot c={tealOf(t)} />
              <span data-bs-rail-count="" style={{ flex: 1, minWidth: 0, fontFamily: BS_CLEAN_HEAD, fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{count}</span>
              <BSWtRowButton t={t} onClick={p.onHide} aria={tr('feed:rail.hideAria', { defaultValue: 'Hide the online members rail' })} label={tr('feed:rail.hide', { defaultValue: 'Hide' })} icon="close" />
            </div>
            <div data-bswt-scroll="" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 12px 14px' }}>
              {p.people.map((person, i) => {
                const s = bsWtStatus(t, tr, person);
                return (
                  // Mid-activity → the live boost sheet; otherwise the profile (the client's onFace).
                  <button key={person.userId || i} type="button" data-bs-wall-face={isCoach(person) ? 'coach' : 'member'} onClick={() => p.onFace(person)}
                    style={{ ...bsWallRaised(t, 16), flex: 'none', width: 72, minHeight: 96, padding: '6px 4px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', color: INK,
                      animation: `bswt-in 420ms cubic-bezier(.2,.8,.2,1) ${Math.min(i, 8) * 50}ms both` }}>
                    <BSWtFace t={t} person={person} face={p.face} />
                    <span style={{ marginTop: 1, maxWidth: '100%', fontFamily: BS_CLEAN_HEAD, fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{firstName(person)}</span>
                    <span data-bs-wall-status="" style={{ marginTop: 2, maxWidth: '100%', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: BS_CLEAN_SANS, fontSize: 10.5, fontWeight: 600, lineHeight: 1.2, color: inkA(t, 0.56), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.c ? <span aria-hidden="true" style={{ flex: 'none', width: 5, height: 5, borderRadius: 99, background: s.c }} /> : null}
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!p.railOn && has && (
          // The way back, in place (owner ask 2026-08-28): once hidden, the count stands where the cards were,
          // with Show at its end.
          <div data-bs-wall-online="off" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: `${p.wall ? 6 : 2}px 12px 6px 16px`, minHeight: 44 }}>
            <BSWtLiveDot c={inkA(t, 0.35)} still />
            <span data-bs-rail-count="" style={{ flex: 1, minWidth: 0, fontFamily: BS_CLEAN_HEAD, fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: inkA(t, 0.56), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{count}</span>
            <BSWtRowButton t={t} tone="teal" onClick={p.onShow} aria={tr('feed:rail.showAria', { defaultValue: 'Show the online members rail' })} label={tr('feed:rail.show', { defaultValue: 'Show' })} icon="plus" />
          </div>
        )}
        {p.wall && <div style={{ marginTop: p.railOn && has ? 0 : 10 }}><BSWallTypeTrack t={t} types={p.types} type={p.type} onType={p.onType} typesLabel={p.typesLabel} /></div>}
      </section>
    </BSCleanType>
  );
}
