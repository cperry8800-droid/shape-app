// Client colours: one fixed colour per client on every page, and the small fixed maps for
// calendar kinds and program types (the owner's coach cockpit, 2026-11: "Every client has one
// fixed colour on every page … calendar kinds, program types and playlists get their own.
// Status is always a labelled chip."). Pure: no DOM, no storage, no network.
//
// CANONICAL here; the website loads it as `window.ShapeClientColors` (TrainerApp.html,
// NutritionistApp.html) and mobile-app/src/services/clientColors.mjs re-exports it for the
// app and for Node tests.
//
// ⚠ A CLIENT'S COLOUR IS A FUNCTION OF THEIR ID AND NOTHING ELSE: never their place in a list,
// a sort, a filter or a roster's length, or the same client turns another colour when the
// coach re-sorts. Two clients CAN share a colour (ten colours, any number of clients); the name
// is always drawn beside it, so the colour is a second cue and never the only one.
//
// ⚠ THE PALETTE STAYS OFF EVERY COLOUR THAT ALREADY MEANS SOMETHING: Shape's teal (the brand,
// and "new"), trainer rust and nutritionist gold (the roles), red, amber and green (status),
// Night's amber, and the check-in azure below. What is left is the blue-to-pink half of the
// wheel, which holds ten colours at least a just-visible step apart (OKLab distance 0.069 or
// more, and 0.08 or more from every reserved colour); twelve would put two pairs at 0.045.
//
// ⚠ EACH COLOUR IS TWO VALUES, ONE PER KIND OF PAPER, and each is TEXT-SAFE: `light` reads
// 4.5:1 or better on White's and Bone's card, ground and resting fill, `dark` on the card and
// ground of Dark, Carbon, Night and Glass (Glass's also over each of its glows). A name drawn
// in it keeps AA. tests/dash-depth.test.mjs measures every value against dash.css itself.

/** The ten client colours, in hue order. `key` is stable: store or compare that, never an index. */
export const CLIENT_PALETTE = Object.freeze([
  Object.freeze({ key: 'ocean', label: 'Ocean', light: '#054d60', dark: '#15b6df' }),
  Object.freeze({ key: 'cobalt', label: 'Cobalt', light: '#03328f', dark: '#73a3fc' }),
  Object.freeze({ key: 'iris', label: 'Iris', light: '#3f4fbb', dark: '#9fb3fe' }),
  Object.freeze({ key: 'indigo', label: 'Indigo', light: '#4b34a3', dark: '#c5c4fd' }),
  Object.freeze({ key: 'violet', label: 'Violet', light: '#4e1586', dark: '#b093e5' }),
  Object.freeze({ key: 'purple', label: 'Purple', light: '#762c95', dark: '#dfa7fc' }),
  Object.freeze({ key: 'orchid', label: 'Orchid', light: '#640868', dark: '#e484e7' }),
  Object.freeze({ key: 'magenta', label: 'Magenta', light: '#82126c', dark: '#ca8fb8' }),
  Object.freeze({ key: 'pink', label: 'Pink', light: '#9f2b70', dark: '#fe9dd0' }),
  Object.freeze({ key: 'raspberry', label: 'Raspberry', light: '#6f0942', dark: '#fe7bb5' }),
]);

/** Which value each paper (`<html data-paper>`) takes. White is the default, with no attribute. */
export const PAPER_TONE = Object.freeze({ white: 'light', bone: 'light', dark: 'dark', carbon: 'dark', night: 'dark', glass: 'dark' });

/** 'light' or 'dark' for a paper name; anything unknown or empty is White, the default. */
export function paperTone(paper) {
  return PAPER_TONE[String(paper || '').trim().toLowerCase()] || 'light';
}

// FNV-1a, 32-bit: small, fast, and spreads short and long ids (uuids, demo slugs) evenly.
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const idKey = (id) => (id == null ? '' : String(id).trim().toLowerCase());

/** The palette index for a client id, or -1 for no id. Case and surrounding space do not count. */
export function clientColorIndex(id) {
  const k = idKey(id);
  return k ? hash32(k) % CLIENT_PALETTE.length : -1;
}

/**
 * A client's colour: { key, label, light, dark, color }, where `color` is the value for `paper`
 * (a `data-paper` name; omitted means White). null for a missing id, so a caller can fall back
 * to its plain ink rather than paint an unknown client the first colour.
 */
export function clientColor(id, paper) {
  const i = clientColorIndex(id);
  if (i < 0) return null;
  const c = CLIENT_PALETTE[i];
  return { key: c.key, label: c.label, light: c.light, dark: c.dark, color: paperTone(paper) === 'dark' ? c.dark : c.light };
}

/**
 * The inline custom properties for dash.css's `.sh-client-ink`, which picks the value for the
 * paper in force, so a paper switch recolours the name with no render. null for a missing id.
 */
export function clientColorVars(id) {
  const c = clientColor(id);
  return c ? { '--client-ink-light': c.light, '--client-ink-dark': c.dark } : null;
}

// ── Calendar kinds ──────────────────────────────────────────────────────────────────────────
// A session is drawn in its client's colour; the other kinds have their own, and every block
// also says its kind in words. Check-ins azure, consults gold, time off hatched in a neutral
// (cockpit). The azure is the paper's own sky; the gold one step deeper than --sh-gold, which
// reads 3.8:1 on Bone's ground.
export const CALENDAR_KINDS = Object.freeze({
  session: Object.freeze({ key: 'session', label: 'Session', fromClient: true }),
  checkin: Object.freeze({ key: 'checkin', label: 'Check-in', light: '#1b5f8a', dark: '#7ed4ff' }),
  consult: Object.freeze({ key: 'consult', label: 'Consult', light: '#79570b', dark: '#d8a23a' }),
  timeoff: Object.freeze({ key: 'timeoff', label: 'Time off', light: '#535e5b', dark: '#aaa49c', hatch: true }),
});

/**
 * A calendar block's colour: { key, label, light, dark, color, hatch }. A session takes its
 * client's colour (`clientId`), or null when it has none; an unknown kind is null.
 */
export function calendarKindColor(kind, paper, clientId) {
  const k = CALENDAR_KINDS[kind];
  if (!k) return null;
  if (k.fromClient) {
    const c = clientColor(clientId, paper);
    return c ? { ...c, key: k.key, label: k.label, client: c.key, hatch: false } : null;
  }
  return { key: k.key, label: k.label, light: k.light, dark: k.dark, color: paperTone(paper) === 'dark' ? k.dark : k.light, hatch: !!k.hatch };
}

// ── Program types ───────────────────────────────────────────────────────────────────────────
// The cockpit's plan types, each with its own colour: Cut tangerine, Maintain mint, Build
// violet, Race azure, Intake slate. These are a plan's TYPE, not a status, and they appear on
// plan covers and calendar spans, never beside a client's colour as the only cue.
export const PROGRAM_TYPES = Object.freeze({
  cut: Object.freeze({ key: 'cut', label: 'Cut', hue: 'tangerine', light: '#964702', dark: '#f99e65' }),
  maintain: Object.freeze({ key: 'maintain', label: 'Maintain', hue: 'mint', light: '#1a6650', dark: '#79dbb2' }),
  build: Object.freeze({ key: 'build', label: 'Build', hue: 'violet', light: '#5b3cc0', dark: '#ac90f8' }),
  race: Object.freeze({ key: 'race', label: 'Race', hue: 'azure', light: '#1b5f8a', dark: '#7ed4ff' }),
  intake: Object.freeze({ key: 'intake', label: 'Intake', hue: 'slate', light: '#4f5f71', dark: '#b0c0d1' }),
});

/** A program type's colour: { key, label, hue, light, dark, color }, or null for an unknown type. */
export function programTypeColor(type, paper) {
  const t = PROGRAM_TYPES[String(type || '').trim().toLowerCase()];
  return t ? { ...t, color: paperTone(paper) === 'dark' ? t.dark : t.light } : null;
}
