// clubViews.mjs — Club Shape's filmed views: which rooms there are, which picture each one shows on
// which screen, the order a tour walks them in, and the film that shows them. No clock and no
// randomness; the DOM is touched only inside createClubFilm, which a caller hands a host. Shared
// by the website's Radio page and the app's Club Shape screen so the two cannot come to disagree
// about what the club is.
//
// Owner, 2026-11-16: "make it look like the pictures, more real". The live 3D room (noraBooth.mjs)
// reads as a video game beside Nora's portrait and the venue picture, so the club is shown through
// photographs of it: each view is a still made from a frame of the real 3D club (the layout: the
// wall-to-wall LED screen with the mark, the balcony tiers, the skylight and the skyline) and
// Nora's portrait. The 3D room stays, under "Look around in 3D". Each still's task id, references
// and prompt are in marketing/club-shape/views-sources.md.
//
// ⚠ THE ROOMS AND THE GROUNDS ARE SCENERY. Floor tables, balcony booths, the private room, the
// pools, the courts and the track are pictures of the club, not products: no booking, price or
// availability is shown anywhere until one exists (prototypes/nora-booth/README.md, "Rules that
// bind every change").

/** Bump when a still is replaced under its own name (the repo's rule for an image: a new `?v=` by hand). */
export const CLUB_ASSET_VERSION = '20261116a';

/**
 * The views, in tour order. `arrival` is the door, the club from the street (owner, 2026-11-16, of
 * their own picture of it: "this is outside of club shape"): a visit starts there and the tour
 * never returns to it. `label` and `alt` are the English a surface without a catalogue shows; the app
 * reads `radio:club.view.<id>` and `radio:club.alt.<id>` with these as defaults.
 */
export const CLUB_VIEWS = Object.freeze([
  Object.freeze({ id: 'arrival', label: 'Arrival', alt: 'Club Shape from the street at night: a flowing building of lit terraces and palms, its sign over the entrance, and the city’s towers behind it' }),
  Object.freeze({ id: 'atrium', label: 'The club', alt: 'The whole room from the top balcony: three tiers of balconies with palms, a ring of light around the opening to the skyline, and the stage screen reading Club Shape over a full dance floor' }),
  Object.freeze({ id: 'floor', label: 'Main floor', alt: 'The dance floor facing the stage: Nora at the booth under the Club Shape screen, with roped-off tables on both sides' }),
  Object.freeze({ id: 'decks', label: 'Nora', alt: 'Nora at the decks, headphones on, with the crowd behind her' }),
  Object.freeze({ id: 'booth', label: 'Behind the decks', alt: 'The room from behind Nora: the decks, the crowd, the balconies and the skyline through the ceiling' }),
  Object.freeze({ id: 'tables', label: 'Floor tables', alt: 'A table beside the dance floor, with bottles on ice, looking across the crowd to the stage' }),
  Object.freeze({ id: 'balcony', label: 'Balcony booths', alt: 'A booth on the second balcony, looking down over the dance floor to the stage' }),
  Object.freeze({ id: 'suite', label: 'Private room', alt: 'A private room with sofas and its own bar, behind a glass wall over the main room' }),
  Object.freeze({ id: 'lounge', label: 'VIP lounge', alt: 'The VIP lounge: a lit onyx wall, a velvet banquette and sofas under chandeliers' }),
  Object.freeze({ id: 'bar', label: 'Cocktail bar', alt: 'The cocktail bar: a lit stone counter, a wall of bottles and the Shape mark in neon' }),
  // Outside, by day (owner, 2026-11-16: "add swimming pools, tennis courts, padel courts around the
  // outside of club shape. Have the setting be a sunny day. Create a few settings for club shape to
  // be in", then "maybe an outdoor track, make it look organized").
  Object.freeze({ id: 'grounds', label: 'The grounds', alt: 'Club Shape and its grounds from the air on a sunny day: swimming pools, tennis courts, padel courts and a running track among palms, with the city behind' }),
  Object.freeze({ id: 'pool', label: 'Poolside', alt: 'The pool on a sunny day, with loungers and umbrellas, looking across the water at Club Shape' }),
  Object.freeze({ id: 'courts', label: 'Courts', alt: 'A padel match on a sunny day, beside the tennis courts, with Club Shape behind' }),
  Object.freeze({ id: 'track', label: 'The track', alt: 'Runners on the outdoor track on a sunny day, with the courts and Club Shape behind' }),
  Object.freeze({ id: 'sunset', label: 'Sunset', alt: 'Club Shape at sunset across its pool and courts, its lights just coming on' }),
]);

export const CLUB_DOOR = 'arrival';
/** Where a visit lands once the door is passed. */
export const CLUB_FIRST = 'atrium';

const BY_ID = new Map(CLUB_VIEWS.map((v) => [v.id, v]));
const TOUR = Object.freeze(CLUB_VIEWS.filter((v) => v.id !== CLUB_DOOR).map((v) => v.id));

/** The view with this id, or null. */
export function clubView(id) {
  return BY_ID.get(id) || null;
}

/** The rooms a visitor can pick, in order: every view but the door. */
export function clubRooms() {
  return TOUR.map((id) => BY_ID.get(id));
}

/**
 * The next view on the tour. From the door, or from an id the club does not have, it is the first
 * room. `step` may be negative (the previous room); the tour wraps both ways.
 */
export function nextClubView(id, step = 1) {
  const i = TOUR.indexOf(id);
  if (i < 0) return CLUB_FIRST;
  const s = Number.isFinite(step) ? Math.trunc(step) : 1;
  const n = TOUR.length;
  return TOUR[(((i + s) % n) + n) % n];
}

// How long the tour stays on a view: eight bars of the music when its tempo is known, held between
// 9 and 20 seconds, else 12 seconds. A cut every eight bars is the phrase the booth's own director
// cuts on (noraDirector.mjs SHOTS), so the pictures change where the music does.
export const CLUB_DWELL_MS = 12000;
const DWELL_MIN = 9000, DWELL_MAX = 20000, BARS = 8, BEATS_PER_BAR = 4;

/** Milliseconds the tour holds a view at this tempo (beats a minute); the default without one. */
export function clubDwellMs(bpm) {
  const b = Number(bpm);
  if (!Number.isFinite(b) || b < 40 || b > 240) return CLUB_DWELL_MS;
  const ms = (BARS * BEATS_PER_BAR * 60000) / b;
  return Math.round(Math.min(DWELL_MAX, Math.max(DWELL_MIN, ms)));
}

/**
 * The seconds one swell of the light takes: one bar at a known tempo, else a slow four seconds.
 * Never faster than once a second, so nothing on screen can read as a flash (the booth's rule:
 * under three a second; this is far inside it).
 */
export function clubPulseSeconds(bpm) {
  const b = Number(bpm);
  if (!Number.isFinite(b) || b < 40 || b > 240) return 4;
  return Math.max(1, (BEATS_PER_BAR * 60) / b);
}

/** Which cut of a still a box takes: the tall one when the box is clearly taller than wide. */
export function clubFormat({ width = 0, height = 0 } = {}) {
  const w = Number(width) || 0, h = Number(height) || 0;
  return w > 0 && h / w > 1.15 ? 'portrait' : 'landscape';
}

/**
 * Whether a box should take the lighter file: its longest side, in device pixels, is under what
 * the small cut already covers (1280 across, or 1280 tall). An unknown size takes the small one:
 * the cheap file is the one that cannot hurt.
 */
export function clubSmall({ width = 0, height = 0, dpr = 1 } = {}) {
  const side = Math.max(Number(width) || 0, Number(height) || 0) * (Number(dpr) > 0 ? Number(dpr) : 1);
  return !(side > 1280);
}

/**
 * The URL of a view's still. `base` is the surface's root: "/" on the website, the site's origin
 * for the installed app. Null for an id the club does not have.
 */
export function clubViewUrl(id, { base = '/', format = 'landscape', small = false } = {}) {
  if (!BY_ID.has(id)) return null;
  const b = typeof base === 'string' && base ? base : '/';
  const cut = (format === 'portrait' ? 'p' : 'l') + (small ? '-sm' : '');
  return `${b.endsWith('/') ? b : b + '/'}club/${id}-${cut}.webp?v=${CLUB_ASSET_VERSION}`;
}

// ── The film ─────────────────────────────────────────────────────────────────
// Shows the views in a box: one still at a time, cross-faded into the next, drifting slowly, with a
// soft swell of light on the bar. DOM and CSS only (no three, no canvas, no video), so it is a few
// kilobytes and loads with the page; the stills are fetched one at a time, each before it is shown.
// It lives in this file, not beside it, so a page loads the views and the film under ONE cache key:
// two modules that must agree, cached apart, is the stale pairing tests/radio-module-cache-keys
// exists to stop.
//
// ⚠ NOTHING HERE CLAIMS A BROADCAST. The pictures are stills of the club; the swell follows a tempo
// only when the caller measured one (setTempo), and is a slow breath otherwise. It never flashes:
// one swell takes at least a second (clubPulseSeconds), and reduced motion holds every layer still.
const STYLE_ID = 'club-film-style';
const FADE_MS = 900;
const CSS = `
.cf-root{position:absolute;inset:0;overflow:hidden;background:#05070a}
.cf-layer{position:absolute;inset:-2%;background-position:center;background-size:cover;background-repeat:no-repeat;opacity:0;transition:opacity ${FADE_MS}ms ease;will-change:opacity,transform}
.cf-layer.cf-on{opacity:1}
.cf-layer.cf-drift-a{animation:cf-drift-a 24s ease-in-out infinite alternate}
.cf-layer.cf-drift-b{animation:cf-drift-b 24s ease-in-out infinite alternate}
.cf-light{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:.0;background:radial-gradient(ellipse 70% 55% at 50% 30%,rgba(52,214,197,.34),rgba(52,214,197,0) 70%),radial-gradient(ellipse 45% 40% at 50% 96%,rgba(255,196,128,.18),rgba(255,196,128,0) 72%);animation:cf-swell var(--cf-pulse,4s) ease-in-out infinite}
.cf-shade{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 120% 100% at 50% 45%,rgba(0,0,0,0) 55%,rgba(0,0,0,.42) 100%)}
.cf-still .cf-layer{transition:none;animation:none!important}
.cf-still .cf-light{animation:none;opacity:.12}
@keyframes cf-drift-a{from{transform:scale(1) translate3d(-.4%,.3%,0)}to{transform:scale(1.03) translate3d(.4%,-.3%,0)}}
@keyframes cf-drift-b{from{transform:scale(1.03) translate3d(.4%,.3%,0)}to{transform:scale(1) translate3d(-.4%,-.3%,0)}}
@keyframes cf-swell{0%,100%{opacity:.04}50%{opacity:.26}}
@media (prefers-reduced-motion: reduce){.cf-layer{transition:none;animation:none!important}.cf-light{animation:none;opacity:.12}}
`;

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(el);
}

/**
 * Mount the film in `host` (a positioned box the caller sizes).
 * @param {object} o
 * @param {HTMLElement} o.host
 * @param {string} [o.base]            root the stills are under: "/" on the website, the site's origin in the app
 * @param {boolean} [o.reducedMotion]  hold every layer still (the media query does the same without it)
 * @param {(s: {id: string|null, status: 'loading'|'shown'|'failed', auto: boolean}) => void} [o.onChange]
 * @param {(url: string) => Promise<void>} [o.load]  fetch a still; the default decodes an Image. Tests pass their own.
 * @returns {{ show(id: string): void, next(step?: number): void, setAuto(on: boolean): void, setTempo(bpm: number|null): void, resize(): void, readonly view: string|null, readonly auto: boolean, destroy(): void }}
 */
export function createClubFilm({ host, base = '/', reducedMotion = false, onChange = null, load = null } = {}) {
  if (!host || !host.ownerDocument) throw new Error('createClubFilm needs a host element');
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  ensureStyle(doc);

  const root = doc.createElement('div');
  root.className = 'cf-root' + (reducedMotion ? ' cf-still' : '');
  const layers = [doc.createElement('div'), doc.createElement('div')];
  layers.forEach((l) => { l.className = 'cf-layer'; l.setAttribute('aria-hidden', 'true'); root.appendChild(l); });
  const shade = doc.createElement('div'); shade.className = 'cf-shade'; shade.setAttribute('aria-hidden', 'true'); root.appendChild(shade);
  const light = doc.createElement('div'); light.className = 'cf-light'; light.setAttribute('aria-hidden', 'true'); root.appendChild(light);
  host.appendChild(root);

  const loadStill = typeof load === 'function' ? load : (url) => new Promise((resolve, reject) => {
    const img = new win.Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('still failed to load'));
    img.src = url;
  });

  let alive = true, front = 0, view = null, shownUrl = null, auto = false, bpm = null, timer = null, ticket = 0, drift = 0;
  let status = 'loading';

  const say = (now) => { status = now; if (alive && typeof onChange === 'function') onChange({ id: view, status, auto }); };
  const box = () => {
    const r = host.getBoundingClientRect ? host.getBoundingClientRect() : { width: 0, height: 0 };
    return { width: r.width || host.clientWidth || 0, height: r.height || host.clientHeight || 0, dpr: (win && win.devicePixelRatio) || 1 };
  };
  const urlFor = (id) => { const b = box(); return clubViewUrl(id, { base, format: clubFormat(b), small: clubSmall(b) }); };

  function arm() {
    if (timer) { win.clearTimeout(timer); timer = null; }
    // The tour waits while the page is hidden, and never leaves the door on its own.
    if (!alive || !auto || !view || view === CLUB_DOOR || doc.hidden) return;
    timer = win.setTimeout(() => { timer = null; next(1); }, clubDwellMs(bpm));
  }

  function show(id) {
    if (!alive || !clubView(id)) return;
    const url = urlFor(id);
    if (id === view && url === shownUrl) { arm(); return; }
    const mine = ++ticket;
    view = id;
    say('loading');
    loadStill(url).then(() => {
      if (!alive || mine !== ticket) return;   // a later pick, or the film is gone
      const back = layers[1 - front];
      back.style.backgroundImage = `url("${url}")`;
      back.classList.remove('cf-drift-a', 'cf-drift-b');
      back.classList.add(drift++ % 2 ? 'cf-drift-b' : 'cf-drift-a');
      back.classList.add('cf-on');
      layers[front].classList.remove('cf-on');
      front = 1 - front;
      shownUrl = url;
      say('shown');
      arm();
    }).catch(() => {
      if (!alive || mine !== ticket) return;
      // The picture that was up stays up; the page says the new one did not arrive.
      say('failed');
      arm();
    });
  }

  function next(step = 1) { show(nextClubView(view, step)); }

  // Turning the tour on or off says so, and says nothing new about the picture: one still loading,
  // or one that failed, is still that.
  function setAuto(on) {
    auto = !!on;
    arm();
    say(status);
  }

  function setTempo(value) {
    const b = Number(value);
    bpm = Number.isFinite(b) && b >= 40 && b <= 240 ? b : null;
    root.style.setProperty('--cf-pulse', clubPulseSeconds(bpm).toFixed(3) + 's');
  }

  // A box that turns from wide to tall (a phone rotated, a window narrowed) takes the other cut.
  function resize() { if (alive && view && urlFor(view) !== shownUrl) { const id = view; view = null; show(id); } }

  const onVisible = () => arm();
  doc.addEventListener('visibilitychange', onVisible);
  setTempo(null);

  return {
    show, next, setAuto, setTempo, resize,
    get view() { return view; },
    get auto() { return auto; },
    destroy() {
      if (!alive) return;
      alive = false;
      if (timer) win.clearTimeout(timer);
      doc.removeEventListener('visibilitychange', onVisible);
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}
