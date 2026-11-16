import React from 'react';
import { CLUB_DOOR, CLUB_FIRST, clubView, clubRooms, nextClubView, createClubFilm } from '../../../public/newdesign/booth/clubViews.mjs';
// ─── CLUB SHAPE (Radio → Club Shape) ─────────────────────────────────────────
// Owner, 2026-11-16: "improve the graphics and flow of club shape on website and app", then, asked
// what the club should look like at its best, "make it look like the pictures, more real".
//
// The club had no door in the app: it was a box under "Nora · DJ preview" on the Radio screen, behind
// "Watch Nora (preview)" and a "Loading Nora… 37%" line, with its rooms as loose camera chips. This
// is its own screen: the door (the club from the street), then the rooms and the grounds outside as
// pictures of the club (clubViews.mjs, the module the website's Radio page shows them with), a tour
// that walks them, and the live 3D room under "Look around in 3D".
//
// ⚠ THE LIVE ROOM IS HANDED IN, NOT IMPORTED. BSNoraBooth and the kept booth belong to the Radio
// module (three loads only when it opens; tests/nora-booth-mounts.test.mjs). This screen takes
// `renderLive` from the Radio screen and draws what it returns, so nothing here imports back.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP: this file is a static import of the
// Radio module and evaluates before the chrome has put BSBackRow on window (React error #130).
//
// ⚠ THE PICTURES ARE NOT A FEED, AND THE SCREEN SAYS SO. Nothing here says LIVE: the one line about
// what is playing is the station's own measured state, passed in. The floor tables, booths, private
// room, pools, courts and track are scenery, with no booking, price or availability (clubViews.mjs).

const { useState, useEffect, useRef } = React;

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

/** Where the stills are: the site's own origin (the hosted /m/ build is on it; a native build is told it). */
export function bsClubBase() {
  const root = window.ShapeApi && typeof window.ShapeApi.url === 'function' ? window.ShapeApi.url('/') : '/';
  return typeof root === 'string' && root ? root : '/';
}

// The club's name is a brand noun, the same in every language; the title sets its second word in the
// accent, so the name is split here rather than typed as two words in the markup.
const CLUB_NAME = 'Club Shape'.split(' ');

/**
 * @param {object} p
 * @param {() => void} p.onBack
 * @param {() => void} [p.onSets]          open Shape Sets, the club's series
 * @param {boolean} [p.stationPlaying]     the stream is playing on this device (measured by the Radio screen)
 * @param {number|null} [p.bpm]            the tempo the server sent for what is playing, or null
 * @param {boolean} [p.live]               the live 3D room is showing in place of the pictures
 * @param {(on: boolean) => void} [p.onLive]
 * @param {() => React.ReactNode} [p.renderLive]  the Radio module's booth
 */
export function BSClubShape({ onBack, onSets, stationPlaying = false, bpm = null, live = false, onLive, renderLive }) {
  const { useBS, BSLogo, BSMastBackSlot, BSBackRow, BS_MAST_ROW_H = 34, BS_MAST_LOGO = 26,
    BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))' } = window;
  const t = useBS();
  const tr = useShapeTr();
  const hostRef = useRef(null);
  const railRef = useRef(null);
  const filmRef = useRef(null);
  const roomRef = useRef(null);     // the room to come back to from the live room
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The tour changes the picture by itself, so a member who asked for reduced motion starts with it
  // stopped (Codex P2, #2744: the CSS held the layers still and the timer swapped them anyway).
  // "Take the tour" is still theirs to press.
  const tourRef = useRef(!reduced);
  const [entered, setEntered] = useState(false);
  const [tour, setTour] = useState(!reduced);
  const [snap, setSnap] = useState({ id: null, status: 'loading', auto: false });
  const [seen, setSeen] = useState(false);

  // The film lives as long as its box does: through the door and the rooms, gone while the live
  // room has the stage, and back on the room the member left.
  useEffect(() => {
    if (live || !hostRef.current) return undefined;
    const film = createClubFilm({
      host: hostRef.current, base: bsClubBase(), reducedMotion: reduced,
      // The room on screen is the one to come back to, whether it was picked or the tour reached it.
      onChange: (s) => { setSnap(s); if (s.status === 'shown') { setSeen(true); roomRef.current = s.id; } },
    });
    filmRef.current = film;
    film.setAuto(tourRef.current);
    film.show(roomRef.current || CLUB_DOOR);
    const fit = () => film.resize();
    window.addEventListener('resize', fit);
    return () => { window.removeEventListener('resize', fit); film.destroy(); filmRef.current = null; };
  }, [live]);

  // The light keeps the station's tempo only while the station plays and the server sent one.
  const tempo = stationPlaying && bpm ? bpm : null;
  useEffect(() => { if (filmRef.current) filmRef.current.setTempo(tempo); }, [tempo, live]);

  // The tour moves on by itself, so the rail follows it, by moving the rail alone.
  useEffect(() => {
    const rail = railRef.current;
    const on = rail && snap.id ? rail.querySelector(`[data-club-room="${snap.id}"]`) : null;
    if (!on) return;
    const left = on.offsetLeft - rail.offsetLeft, right = left + on.offsetWidth;
    if (left < rail.scrollLeft) rail.scrollLeft = Math.max(0, left - 12);
    else if (right > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = right - rail.clientWidth + 12;
  }, [snap.id, entered, live]);

  const go = (id) => { roomRef.current = id; if (filmRef.current) filmRef.current.show(id); };
  const enter = () => { setEntered(true); go(CLUB_FIRST); };
  // Choosing a room is choosing to stay in it: the tour stops until it is asked for again.
  const stay = () => { tourRef.current = false; setTour(false); if (filmRef.current) filmRef.current.setAuto(false); };
  const pick = (id) => { stay(); go(id); };
  const step = (n) => { stay(); go(nextClubView(snap.id, n)); };
  const toggleTour = () => { const on = !tourRef.current; tourRef.current = on; setTour(on); if (filmRef.current) filmRef.current.setAuto(on); };
  const look = (on) => { if (on) setEntered(true); if (onLive) onLive(on); };

  const TEAL = t.ACCENT;
  // The club is a fixed-dark ground on either paper, so its inks are fixed too (as Shape Sets' are).
  const GROUND = '#05070a', CREAM = '#f4ede0', CREAM60 = 'rgba(244,237,224,0.62)', CREAM25 = 'rgba(244,237,224,0.25)', RULE = 'rgba(244,237,224,0.16)';
  const view = snap.id ? clubView(snap.id) : null;
  // ⚠ ONE LITERAL KEY A ROOM, NOT A KEY BUILT FROM ITS ID: the catalogue's checks read the keys out
  // of the source, and a built key is one they cannot see (the booth's labels are a switch for the
  // same reason). The English beside each is clubViews.mjs's own (tests/club-shape-surfaces.test.mjs).
  const NAMES = {
    arrival: tr('radio:club.view.arrival', { defaultValue: 'Arrival' }),
    atrium: tr('radio:club.view.atrium', { defaultValue: 'The club' }),
    floor: tr('radio:club.view.floor', { defaultValue: 'Main floor' }),
    decks: tr('radio:club.view.decks', { defaultValue: 'Nora' }),
    booth: tr('radio:club.view.booth', { defaultValue: 'Behind the decks' }),
    tables: tr('radio:club.view.tables', { defaultValue: 'Floor tables' }),
    balcony: tr('radio:club.view.balcony', { defaultValue: 'Balcony booths' }),
    suite: tr('radio:club.view.suite', { defaultValue: 'Private room' }),
    lounge: tr('radio:club.view.lounge', { defaultValue: 'VIP lounge' }),
    bar: tr('radio:club.view.bar', { defaultValue: 'Cocktail bar' }),
    grounds: tr('radio:club.view.grounds', { defaultValue: 'The grounds' }),
    pool: tr('radio:club.view.pool', { defaultValue: 'Poolside' }),
    courts: tr('radio:club.view.courts', { defaultValue: 'Courts' }),
    track: tr('radio:club.view.track', { defaultValue: 'The track' }),
    sunset: tr('radio:club.view.sunset', { defaultValue: 'Sunset' }),
  };
  const ALTS = {
    arrival: tr('radio:club.alt.arrival', { defaultValue: 'Club Shape from the street at night: a flowing building of lit terraces and palms, its sign over the entrance, and the city’s towers behind it' }),
    atrium: tr('radio:club.alt.atrium', { defaultValue: 'The whole room from the back balcony: a full dance floor running to a screen the size of the end wall, reading Club Shape, with palms on the balconies and two triangles in the roof open to the skyline' }),
    floor: tr('radio:club.alt.floor', { defaultValue: 'The dance floor facing the stage: Nora at the booth under a screen that fills the end wall, roped-off tables to the right of the booth, and triangle chandeliers lowered from the roof' }),
    decks: tr('radio:club.alt.decks', { defaultValue: 'Nora at the decks, headphones on, with the crowd behind her' }),
    booth: tr('radio:club.alt.booth', { defaultValue: 'The room from behind Nora: the decks, the crowd, the balconies and the skyline through the ceiling' }),
    tables: tr('radio:club.alt.tables', { defaultValue: 'A table on the terrace to the right of the booth, with bottles on ice, looking across the crowd to the stage' }),
    balcony: tr('radio:club.alt.balcony', { defaultValue: 'A booth on the balcony, looking down over the dance floor to the stage' }),
    suite: tr('radio:club.alt.suite', { defaultValue: 'A private room with sofas and its own bar, behind a glass wall over the main room' }),
    lounge: tr('radio:club.alt.lounge', { defaultValue: 'The VIP lounge: a lit onyx wall, a velvet banquette and sofas under chandeliers' }),
    bar: tr('radio:club.alt.bar', { defaultValue: 'The cocktail bar: a lit stone counter, a wall of bottles and the Shape mark in neon' }),
    grounds: tr('radio:club.alt.grounds', { defaultValue: 'Club Shape and its grounds from the air on a sunny day: swimming pools, tennis courts, padel courts and a running track among palms, with the city behind' }),
    pool: tr('radio:club.alt.pool', { defaultValue: 'The pool on a sunny day, with loungers and umbrellas, looking across the water at Club Shape' }),
    courts: tr('radio:club.alt.courts', { defaultValue: 'A padel match on a sunny day, beside the tennis courts, with Club Shape behind' }),
    track: tr('radio:club.alt.track', { defaultValue: 'Runners on the outdoor track on a sunny day, with the courts and Club Shape behind' }),
    sunset: tr('radio:club.alt.sunset', { defaultValue: 'Club Shape at sunset across its pool and courts, its lights just coming on' }),
  };
  const label = (v) => NAMES[v.id] || v.label;
  const film = entered && !live;
  const shade = '0 1px 2px rgba(0,0,0,0.7), 0 0 16px rgba(0,0,0,0.55)';
  const chip = (active) => ({
    flex: '0 0 auto', minHeight: 44, padding: '0 14px', cursor: 'pointer', borderRadius: 8, whiteSpace: 'nowrap',
    background: active ? `${TEAL}1f` : 'transparent', color: active ? TEAL : CREAM, border: `1px solid ${active ? TEAL : CREAM25}`,
    fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
  });
  const round = { width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 22, cursor: 'pointer', padding: 0,
    background: 'rgba(5,7,10,0.55)', border: `1px solid ${CREAM25}`, color: CREAM, fontFamily: t.DISPLAY, fontSize: 20, lineHeight: 1 };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: GROUND }}>
      <div className="bs-scroll" style={{ position: 'absolute', inset: 0, overflow: 'auto', fontFamily: t.DISPLAY, color: CREAM, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div style={{ minHeight: '100%', boxSizing: 'border-box', paddingBottom: 80 + 28 }}>
          <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: BS_MAST_ROW_H }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {BSMastBackSlot ? <BSMastBackSlot /> : null}
                {typeof BSLogo === 'function' && <BSLogo size={BS_MAST_LOGO} color={CREAM} />}
              </div>
            </div>
            {BSBackRow ? <BSBackRow onBack={onBack} ink={CREAM} /> : null}
            <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEAL, fontWeight: 700 }}>{tr('radio:club.eyebrow', { defaultValue: 'Shape’s virtual venue' })}</div>
            <h1 style={{ margin: '8px 0 0', fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.0, color: CREAM }}>{CLUB_NAME[0]} <span style={{ color: TEAL }}>{CLUB_NAME[1]}.</span></h1>
          </div>

          <div style={{ padding: `14px ${t.padX}px 0` }}>
            {live ? (
              <div data-club-live>
                {typeof renderLive === 'function' ? renderLive() : null}
                <button type="button" onClick={() => look(false)} style={{ ...chip(false), width: '100%', marginTop: 2 }}>
                  ← {tr('radio:club.back', { defaultValue: 'Back to the pictures' })}
                </button>
              </div>
            ) : (
              <div data-club-stage role="group" aria-roledescription="carousel" aria-label="Club Shape"
                style={{ position: 'relative', width: '100%', aspectRatio: '9 / 14', maxHeight: 'max(58vh, 420px)', borderRadius: 14, overflow: 'hidden', background: GROUND }}>
                <div ref={hostRef} role="img" aria-label={view ? (ALTS[view.id] || view.alt) : 'Club Shape'} style={{ position: 'absolute', inset: 0 }} />
                <div aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{film && view ? label(view) : ''}</div>

                {!seen && snap.status === 'loading' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: CREAM60 }}>
                    {tr('radio:club.opening', { defaultValue: 'Opening Club Shape…' })}
                  </div>
                )}
                {!seen && snap.status === 'failed' && (
                  <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', fontFamily: t.BODY || t.DISPLAY, fontSize: 13.5, lineHeight: 1.5, color: CREAM }}>
                    {tr('radio:club.closed', { defaultValue: 'The club’s pictures couldn’t load. Check your connection and open it again.' })}
                  </div>
                )}

                {!entered && (
                  // The picture carries the club's own mark and sign, so the door adds only the way in.
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '24px 24px 30px', textAlign: 'center', background: 'linear-gradient(180deg, rgba(5,7,10,0) 55%, rgba(5,7,10,0.78))' }}>
                    <button type="button" data-club-enter onClick={enter} style={{ minHeight: 48, padding: '0 28px', border: 0, borderRadius: 999, cursor: 'pointer', background: TEAL, color: '#04110f', fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800 }}>
                      {tr('radio:club.enter', { defaultValue: 'Step inside' })} →
                    </button>
                  </div>
                )}

                {film && (
                  <>
                    <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', background: 'linear-gradient(180deg, rgba(5,7,10,0), rgba(5,7,10,0.84))', pointerEvents: 'none' }} />
                    <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '18%', background: 'linear-gradient(180deg, rgba(5,7,10,0.6), rgba(5,7,10,0))', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: stationPlaying ? TEAL : CREAM60, textShadow: shade }}>
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, flex: '0 0 auto', background: stationPlaying ? TEAL : 'transparent', border: `1px solid ${stationPlaying ? TEAL : CREAM60}` }} />
                      <span>{stationPlaying ? tr('radio:club.playing', { defaultValue: 'Shape Radio is playing' }) : tr('radio:booth.label.offAir', { defaultValue: 'Off air' })}</span>
                    </div>
                    <div style={{ position: 'absolute', left: 14, right: 12, bottom: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0, textShadow: shade }}>
                        <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', lineHeight: 1.05, color: CREAM }}>{view ? label(view) : ''}</div>
                        {snap.status === 'failed' && (
                          <div role="status" style={{ marginTop: 6, fontFamily: t.BODY || t.DISPLAY, fontSize: 12.5, lineHeight: 1.4, color: '#e3a544' }}>
                            {tr('radio:club.failed', { defaultValue: 'That room’s picture didn’t load. Pick another, or try it again.' })}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                        <button type="button" onClick={() => step(-1)} aria-label={tr('radio:club.prev', { defaultValue: 'Previous room' })} style={round}>‹</button>
                        <button type="button" onClick={() => step(1)} aria-label={tr('radio:club.next', { defaultValue: 'Next room' })} style={round}>›</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {film && (
              <>
                <div ref={railRef} className="bs-scroll" role="group" aria-label={tr('radio:club.rooms', { defaultValue: 'Rooms' })}
                  style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', margin: `12px -${t.padX}px 0`, padding: `0 ${t.padX}px` }}>
                  {clubRooms().map((r) => (
                    <button key={r.id} type="button" data-club-room={r.id} aria-pressed={snap.id === r.id} onClick={() => pick(r.id)} style={chip(snap.id === r.id)}>{label(r)}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <button type="button" aria-pressed={tour} onClick={toggleTour} style={chip(tour)}>
                    {tour ? `■ ${tr('radio:club.tourStop', { defaultValue: 'Stop the tour' })}` : `▶ ${tr('radio:club.tourStart', { defaultValue: 'Take the tour' })}`}
                  </button>
                  <button type="button" data-club-live-open onClick={() => look(true)} style={chip(false)}>{tr('radio:club.look', { defaultValue: 'Look around in 3D' })}</button>
                </div>
              </>
            )}

            {/* The picture comes first and the words after it: with the words on top, the room's name,
                its arrows and the rail of rooms sat under the tab bar on a phone, a scroll away. */}
            {!live && (
              <p style={{ margin: '16px 0 0', fontFamily: t.BODY || t.DISPLAY, fontSize: 14, fontWeight: 500, lineHeight: 1.5, color: 'rgba(244,237,224,0.86)' }}>
                {tr('radio:club.intro', { defaultValue: 'Nora plays the main room. Walk the floor, take a table, go up to a booth or a private room, step out to the lounge and the bar, or head outside to the pools and the courts.' })}
              </p>
            )}
            <p style={{ margin: '12px 0 0', fontFamily: t.BODY || t.DISPLAY, fontSize: 11.5, lineHeight: 1.5, color: CREAM60 }}>
              {live
                ? tr('radio:club.liveNote', { defaultValue: 'This is the live 3D room. While the station is not on the air Nora plays a labelled example set; while it is, she moves on what it is playing.' })
                : tr('radio:club.note', { defaultValue: 'The rooms and grounds are pictures of Club Shape, made with AI. They are not a live feed, and nothing in them is for sale.' })}
            </p>

            {typeof onSets === 'function' && (
              <button type="button" data-club-sets onClick={onSets} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', minHeight: 44, marginTop: 18, padding: '14px 0', textAlign: 'left', cursor: 'pointer', background: 'transparent', color: CREAM, border: 0, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, borderRadius: 0 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: TEAL }}>{tr('radio:club.whatsOn', { defaultValue: 'What’s on' })}</span>
                  <span style={{ display: 'block', marginTop: 4, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{tr('radio:strip.sets', { defaultValue: 'Shape Sets' })}</span>
                </span>
                <span aria-hidden style={{ flex: '0 0 auto', fontFamily: t.MONO, fontSize: 12, color: CREAM }}>→</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
