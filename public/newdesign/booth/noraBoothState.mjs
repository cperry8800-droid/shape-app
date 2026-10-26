// noraBoothState.mjs — what Nora's booth may say about itself, who hears the example set, and
// which tier a device gets. Pure (no three, no clock, and no DOM except `webgl2Available`, which is
// handed the document). The app's Radio screen and the website's Radio page both read it, so the
// two cannot come to disagree about what the booth is showing (docs/REVIEW-2026-09-29-nora-dj.md,
// Phase 1 and §6).
//
// ⚠ THE LABEL REPLACES `● LIVE · NORA (preview)`, WHICH THE APP RENDERED WHENEVER NORA WAS SHOWN,
// whether or not anything was broadcasting. Every label below names something that can be checked
// on the device at that moment, and "Off air" is what the booth says when nothing can.

// The six things the booth can be. `guest` carries the DJ's name; the rest carry nothing.
export const BOOTH_LABEL_KEYS = Object.freeze(['offAir', 'example', 'visualised', 'norasMix', 'guest', 'noBeat']);

// English for the website, which has no translator, and the app's defaultValue. The app's keys
// are `radio:booth.label.<key>` in all 13 locales; `{dj}` is the ICU placeholder.
export const BOOTH_LABEL_EN = Object.freeze({
  offAir: 'Off air',
  example: 'Preview · example set',
  visualised: 'Visualised mix',
  norasMix: 'Nora’s mix',
  guest: 'Guest set · {dj}',
  noBeat: 'No beat to follow',
});

const measured = (v) => Number.isFinite(v) && v > 0;

/**
 * The booth's label, from what the device can actually observe.
 * @param {object} s
 * @param {boolean} [s.example]   the labelled example set is playing on this device
 * @param {object}  [s.station]
 * @param {boolean} [s.station.playing]   the Shape Radio stream is playing on this device
 * @param {number|null} [s.station.bpm]   the tempo MEASURED off that stream, or null
 * @param {string|null} [s.station.guest] the DJ of a live Shape Set on the air, or null
 * @param {boolean} [s.station.cueSheet]  a verified cue sheet is driving the mix (Phase 3)
 * @returns {{key: string, dj?: string}}
 */
export function boothLabel({ example = false, station = null } = {}) {
  // The example set is the only mix that plays without the station, and it says so first: a
  // preview that read "Visualised mix" would be claiming the station.
  if (example) return { key: 'example' };
  const st = station || {};
  if (!st.playing) return { key: 'offAir' };
  // A human Shape Set: Nora steps off the decks, and the label names who is on them.
  const dj = typeof st.guest === 'string' ? st.guest.trim() : '';
  if (dj) return { key: 'guest', dj };
  // Nothing to follow is said in words, never mimed: with no measured tempo she sways on energy.
  if (!measured(st.bpm)) return { key: 'noBeat' };
  // Only a verified cue sheet makes the mix hers (ruling 1). Everything else is a visualisation.
  if (st.cueSheet === true) return { key: 'norasMix' };
  return { key: 'visualised' };
}

/** The label in English, `{dj}` filled. */
export function boothLabelText(label) {
  const k = label && BOOTH_LABEL_EN[label.key] ? label.key : 'offAir';
  return BOOTH_LABEL_EN[k].replace('{dj}', (label && label.dj) || '');
}

/**
 * Who hears the example set (ruling 4, the recommended default):
 *   - nobody while the station's audio is playing on this device;
 *   - signed-out prospects always;
 *   - members only while the station is not configured.
 * `stationConfigured` must be a resolved `true` to withhold it from a member; anything else is
 * read as "not configured", because the example is the booth's only content until it is.
 */
export function exampleAllowed({ prospect = false, stationConfigured = false, stationPlaying = false } = {}) {
  if (stationPlaying) return false;
  if (prospect) return true;
  return stationConfigured !== true;
}

// Phones get the low tier at 30 fps (ruling 7, battery first); everything else the high tier at
// the display's own rate, with the cinematic chain. A phone is judged by its SCREEN, not by the
// box the booth is drawn in, so a desktop previewing the app in a phone frame keeps its tier.
export const PHONE_MAX_SIDE = 600;
export const PHONE_FPS = 30;
export const DESKTOP_FPS = 60;

/**
 * @param {object} d
 * @param {number} [d.screenW]  screen.width in CSS px
 * @param {number} [d.screenH]  screen.height in CSS px
 * @param {string|null} [d.override]  'low' | 'high' (a debug override), anything else ignored
 * @returns {{quality: 'low'|'high', fps: number, cinematic: boolean}}
 */
export function boothTier({ screenW = 0, screenH = 0, override = null } = {}) {
  const side = Math.min(Number(screenW) || 0, Number(screenH) || 0);
  // An unknown screen (0) is treated as a phone: the cheap tier is the one that cannot hurt.
  const phone = override === 'low' || (override !== 'high' && side < PHONE_MAX_SIDE);
  return phone
    ? { quality: 'low', fps: PHONE_FPS, cinematic: false }
    : { quality: 'high', fps: DESKTOP_FPS, cinematic: true };
}

// ── The model ───────────────────────────────────────────────────────────────
// What the booth draws, in one place for both surfaces, so swapping Nora is one line. Paths are
// relative to the site root (the website prefixes "/", the app its BASE_URL).
// Nora is a MakeHuman person built from CC0 assets (scripts/nora-model/makehuman_nora.py, nora.json),
// to the brief in docs/BUILD-2026-10-09-metahuman-nora.md; she replaced pixiv's anime VRoid sample
// (owner, 2026-10-26: "make the crowd look like real people", "including nora"). `portrait` lets the
// full-face close-up into the camera's rotation; an anime model must set it false (a frame-filling
// anime face is the most "animated" frame the booth can show, owner, 2026-10-09).
// The crowd is real people (prototypes/nora-booth/crowd-mh): `crowd` for desktops (eight people, a
// 2048×4096 atlas), `crowdLow` for phones (fewer people, lighter figures, a quarter of the texture).
// Each pack's atlas (.webp) sits beside it.
// skyline/skylineLow: the city through the skylight, two night tower facades (photographs made in
// Higgsfield, 2026-10-26) in one atlas, for clubVenue's towers.
export const NORA_MODEL = Object.freeze({
  path: 'nora/nora.vrm', crowd: 'nora/crowd-people.bin.txt', crowdLow: 'nora/crowd-people-lo.bin.txt', portrait: true,
  skyline: 'nora/skyline.webp', skylineLow: 'nora/skyline-lo.webp',
});

/** The crowd pack a device should load: the desktop pack on high quality, else the phone pack. */
export function crowdPackPath(model = NORA_MODEL, quality = 'low') {
  if (!model) return null;
  return quality === 'high' || !model.crowdLow ? model.crowd : model.crowdLow;
}

/** The skyline atlas a device should load: the desktop one on high quality, else the phone one; null when none. */
export function skylinePath(model = NORA_MODEL, quality = 'low') {
  if (!model || !model.skyline) return null;
  return quality === 'high' || !model.skylineLow ? model.skyline : model.skylineLow;
}

// Club Shape from outside, for the opening fly-in: a 3D model of the Shape Sets picture, built to
// docs/BUILD-2026-10-10-club-shape-model.md. While `path` is null the booth does not fly in at all and
// opens inside, as it always has (the venue drawn in code was rejected by the owner, 2026-10-10).
// `desktop` is an optional heavier file for high-quality devices. Either may be an https URL.
export const CLUB_SHAPE_MODEL = Object.freeze({ path: null, desktop: null });

/** The venue model a device should load: the desktop file on high quality when there is one, else the phone file; null when there is none. */
export function clubShapeModelUrl(model = CLUB_SHAPE_MODEL, base = '/', quality = 'low') {
  if (!model) return null;
  const path = quality === 'high' && model.desktop ? model.desktop : model.path;
  return noraAssetUrl(path, base);
}

// The LED wall's video loops (wallShow.mjs's plate look), made in Higgsfield on 2026-10-26: each a
// 5 s Seedance 2.0 clip whose first and last frames are the same keyframe, so it loops without a
// seam. Their prompts and job ids are in marketing/shape-radio-launch-cut.md (Sources). They are
// served from Higgsfield's CDN, which allows any origin (CORS) and caches them for a year; the
// booth draws them through the wall's dots. Desktops only: a phone keeps the drawn looks (ruling 7,
// battery and data first). Empty, or a loop that will not load, and the show plays the drawn looks.
// The tunnel clip of the same batch is left out: its thin lines rush so fast that a quarter of the
// frame changes by up to 14/255 from one frame to the next, and the drawn tunnel does the same job.
const HF = 'https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY/';
export const WALL_LOOPS = Object.freeze([
  HF + 'hf_20261026_130216_e4e3351c-9a6e-44d8-8796-96d08e10e879.mp4',   // liquid chrome, 1.7 MB
  HF + 'hf_20261026_130217_a0f6defb-eada-40ba-96ea-642dfdff8a67.mp4',   // aurora, 1.0 MB
  HF + 'hf_20261026_130216_dee7d77b-f3da-4dcd-ac47-c5471a1c032f.mp4',   // prism, 3.2 MB
  HF + 'hf_20261026_130216_6d9c5a67-cfbe-4546-befc-57e1c4968e60.mp4',   // particle vortex, 6.9 MB
]);

/**
 * The loops a device should load: all of them on high quality, none on a phone, and none under reduced
 * motion, where the wall holds the dawn and never shows a loop (wallShow.mjs), so they would be ~13 MB
 * downloaded for nothing.
 */
export function wallLoopUrls(quality = 'low', { reducedMotion = false, loops = WALL_LOOPS } = {}) {
  if (quality !== 'high' || reducedMotion || !Array.isArray(loops)) return [];
  return loops.filter((u) => typeof u === 'string' && /^https:\/\//i.test(u));
}

/**
 * Where to fetch an asset NORA_MODEL names. A realistic Nora is hosted OUTSIDE this public repository
 * (scripts/nora-model/README.md), so a path may be a full https URL, which is used as it is; a
 * site path is joined to the surface's base ("/" on the website, the app's BASE_URL).
 */
export function noraAssetUrl(path, base = '/') {
  if (typeof path !== 'string' || !path) return null;
  if (/^https:\/\//i.test(path)) return path;
  const b = typeof base === 'string' && base ? base : '/';
  return (b.endsWith('/') ? b : b + '/') + path.replace(/^\/+/, '');
}

// ── Before downloading three ─────────────────────────────────────────────────
// three r163+ draws only on WebGL 2. Asking first spares a device that has none the megabytes of
// the booth's code. Not pure (it makes a canvas), so the document is passed in; the probe's own
// context is released at once, because browsers cap live contexts.
export function webgl2Available(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || typeof doc.createElement !== 'function') return false;
  try {
    const c = doc.createElement('canvas');
    const gl = c.getContext && c.getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}
